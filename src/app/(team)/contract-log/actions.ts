"use server";

/**
 * Contract server actions (Supabase-only data layer — Batch 2).
 *
 * Reads happen client-side via RLS (see src/lib/data/contracts.ts). These
 * mutations run server-side with the service-role admin client, guarded by
 * requireTeamUser(). Pattern mirrors src/lib/contracts/update-shipping.ts and
 * src/app/(team)/admin/migrate/actions.ts.
 *
 * NOTE: this is a NEW parallel data layer. Nothing imports it yet — Batch 3
 * will wire the UI onto these. The existing localStorage paths are untouched.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamUser } from "@/lib/auth/require-team";
import {
  calcTotals,
  generateContractNumber,
  generateInvoiceNumber,
  CONTRACT_PREFIXES,
} from "@/lib/sales-contract";
import type { SalesContractData } from "@/types/sales-contract";
import type {
  WorkflowStage,
  StageCompletion,
  ContractWorkflow,
  WorkflowHistory,
  ContractCerts,
  ContractCertRef,
  RequiredCert,
} from "@/types/workflow";
import { STAGE_ORDER, normalizeWorkflowHistory } from "@/types/workflow";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Postgres `date` columns reject empty strings; coerce "" → null. */
function normalizeDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export type SaveContractResult =
  | { ok: true; contractId: string; contractNo: string; invoiceNo: string }
  | { ok: false; error: string };

type Admin = ReturnType<typeof createAdminClient>;

/** Resolve a contract-number prefix from the first line item's product. */
async function resolvePrefix(admin: Admin, firstProduct: string): Promise<string> {
  if (!firstProduct) return "";
  const { data } = await admin
    .from("products")
    .select("prefix")
    .eq("name", firstProduct)
    .maybeSingle();
  const dbPrefix = (data as { prefix?: string } | null)?.prefix;
  if (dbPrefix) return dbPrefix;
  return CONTRACT_PREFIXES[firstProduct] ?? "";
}

/**
 * Upsert a contract from the Master Data form shape (`SalesContractData`).
 * Derives contract_no / invoice_no from (year, sequence, prefix); when the
 * sequence is unset it is computed via the race-safe next_contract_sequence RPC.
 * The full submitted snapshot is stored in `master_snapshot` for PDF fidelity.
 */
export async function saveContract(
  input: SalesContractData & { id?: string }
): Promise<SaveContractResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();

  const firstProduct = String(input.lineItems?.[0]?.product ?? "");
  const prefix = await resolvePrefix(admin, firstProduct);
  const year = input.identifiers.year;
  let seq =
    typeof input.identifiers.sequenceNumber === "number"
      ? input.identifiers.sequenceNumber
      : 0;

  if (!seq) {
    const { data: nextSeq, error: seqErr } = await admin.rpc("next_contract_sequence", {
      p_year: year,
      p_prefix: prefix,
    });
    if (seqErr) return { ok: false, error: `Sequence lookup failed: ${seqErr.message}` };
    seq = (nextSeq as number | null) ?? 7001;
  }

  const contractNo = generateContractNumber(year, seq, prefix);
  const invoiceNo = generateInvoiceNumber(year, seq, prefix);
  if (!contractNo || !invoiceNo) {
    return {
      ok: false,
      error: "Could not derive contract/invoice number (missing product prefix or sequence).",
    };
  }

  const totals = calcTotals(input.lineItems, input.terms?.numberOfContainers);
  const buyerId = isUuid(input.buyer?.id) ? input.buyer.id! : null;
  const sellerId = isUuid(input.sellerId) ? input.sellerId : null;

  // saveContract owns the initial workflow stage. New contracts start at
  // "docs-generated"; the costed/etc. stages advance via the StageStrip UI.
  const workflow: ContractWorkflow = input.workflow ?? {
    currentStage: "docs-generated",
    history: { "docs-generated": { completedAt: new Date().toISOString(), by: "auto" } },
  };

  // Reflect the final resolved sequence back into the stored snapshot.
  const snapshot: SalesContractData = {
    ...input,
    identifiers: { ...input.identifiers, sequenceNumber: seq },
    workflow,
  };

  const row = {
    contract_no: contractNo,
    invoice_no: invoiceNo,
    buyer_id: buyerId,
    seller_id: sellerId,
    contract_date: normalizeDate(input.identifiers.contractDate),
    line_items: input.lineItems,
    terms: input.terms ?? null,
    totals,
    current_stage: workflow.currentStage,
    // workflow_history holds BOTH the stage history and the cert refs.
    workflow_history: { history: workflow.history ?? {}, certs: workflow.certs ?? {} },
    bl_number: input.blNumber ?? null,
    containers: input.containers ?? [],
    master_snapshot: snapshot,
    product_label: firstProduct || null,
    status: "Active",
  };

  // Resolve an existing row (explicit id, else by unique contract_no).
  let existingId: string | null = input.id ?? null;
  if (!existingId) {
    const { data: existing } = await admin
      .from("contracts")
      .select("id")
      .eq("contract_no", contractNo)
      .maybeSingle();
    existingId = (existing as { id?: string } | null)?.id ?? null;
  }

  if (existingId) {
    const { error } = await admin.from("contracts").update(row).eq("id", existingId);
    if (error) return { ok: false, error: `Update failed: ${error.message}` };
    return { ok: true, contractId: existingId, contractNo, invoiceNo };
  }

  const { data: inserted, error } = await admin
    .from("contracts")
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: `Insert failed: ${error.message}` };
  return { ok: true, contractId: (inserted as { id: string }).id, contractNo, invoiceNo };
}

/**
 * Delete a contract. Defaults to a soft delete (status='Cancelled', preserving
 * finance/shipping/document rows). Pass `hard: true` to remove the row entirely
 * (cascades to contract_finance / contract_shipping / contract_documents).
 */
export async function deleteContract(
  params: { id: string; hard?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();

  if (params.hard) {
    const { error } = await admin.from("contracts").delete().eq("id", params.id);
    if (error) return { ok: false, error: `Delete failed: ${error.message}` };
    return { ok: true };
  }

  const { error } = await admin
    .from("contracts")
    .update({ status: "Cancelled" })
    .eq("id", params.id);
  if (error) return { ok: false, error: `Cancel failed: ${error.message}` };
  return { ok: true };
}

/** Set a contract's business status (Active / Completed / Cancelled). */
export async function setContractStatus(params: {
  id: string;
  status: "Active" | "Completed" | "Cancelled";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin
    .from("contracts")
    .update({ status: params.status })
    .eq("id", params.id);
  if (error) return { ok: false, error: `Status update failed: ${error.message}` };
  return { ok: true };
}

/* ═════════════════════════ WORKFLOW (Supabase) ═════════════════════════ */
//
// All workflow state lives on the contracts row: `current_stage` column +
// `workflow_history` jsonb (`{ history, certs }`). These actions read-modify-write
// it. Pure stage logic lives in src/types/workflow.ts.

type WorkflowState = { currentStage: WorkflowStage; history: WorkflowHistory["history"]; certs: ContractCerts };

async function readWorkflow(
  admin: Admin,
  contractId: string
): Promise<WorkflowState | null> {
  const { data, error } = await admin
    .from("contracts")
    .select("current_stage, workflow_history")
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const wh = normalizeWorkflowHistory((data as { workflow_history?: unknown }).workflow_history);
  return {
    currentStage: (data as { current_stage: WorkflowStage }).current_stage,
    history: wh.history,
    certs: wh.certs,
  };
}

async function writeWorkflow(
  admin: Admin,
  contractId: string,
  currentStage: WorkflowStage,
  history: WorkflowHistory["history"],
  certs: ContractCerts
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin
    .from("contracts")
    .update({ current_stage: currentStage, workflow_history: { history, certs } })
    .eq("id", contractId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Advance a contract to a new stage, recording the completion in history. */
export async function advanceStage(params: {
  contractId: string;
  newStage: WorkflowStage;
  completion?: Omit<StageCompletion, "completedAt">;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();
  const wf = await readWorkflow(admin, params.contractId);
  if (!wf) return { ok: false, error: "Contract not found" };

  const entry: StageCompletion = {
    ...(params.completion ?? { by: "manual" as const }),
    completedAt: new Date().toISOString(),
  };
  const history = { ...wf.history, [params.newStage]: entry };
  const res = await writeWorkflow(admin, params.contractId, params.newStage, history, wf.certs);
  return res.ok ? { ok: true } : { ok: false, error: `Advance failed: ${res.error}` };
}

/** Skip to a target stage, marking intermediate stages as skipped. */
export async function skipStage(params: {
  contractId: string;
  targetStage: WorkflowStage;
  skipNotes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();
  const wf = await readWorkflow(admin, params.contractId);
  if (!wf) return { ok: false, error: "Contract not found" };

  const currentIdx = STAGE_ORDER.indexOf(wf.currentStage);
  const targetIdx = STAGE_ORDER.indexOf(params.targetStage);
  if (targetIdx === -1) return { ok: false, error: "Unknown stage" };
  if (targetIdx <= currentIdx) return { ok: false, error: "Cannot skip backwards" };

  const now = new Date().toISOString();
  const history = { ...wf.history };
  for (let i = currentIdx + 1; i < targetIdx; i++) {
    const s = STAGE_ORDER[i];
    if (!history[s]) history[s] = { completedAt: now, by: "manual", notes: params.skipNotes ?? "skipped" };
  }
  history[params.targetStage] = { completedAt: now, by: "manual" };
  const res = await writeWorkflow(admin, params.contractId, params.targetStage, history, wf.certs);
  return res.ok ? { ok: true } : { ok: false, error: `Skip failed: ${res.error}` };
}

/** Backfill a completed stage's history without changing the current stage. */
export async function backfillStage(params: {
  contractId: string;
  stage: WorkflowStage;
  completion?: Omit<StageCompletion, "completedAt"> & { completedAt?: string };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();
  const wf = await readWorkflow(admin, params.contractId);
  if (!wf) return { ok: false, error: "Contract not found" };
  if (wf.history[params.stage]) return { ok: true }; // already recorded

  const entry: StageCompletion = {
    by: "manual",
    ...(params.completion ?? {}),
    completedAt: params.completion?.completedAt ?? new Date().toISOString(),
  };
  const history = { ...wf.history, [params.stage]: entry };
  const res = await writeWorkflow(admin, params.contractId, wf.currentStage, history, wf.certs);
  return res.ok ? { ok: true } : { ok: false, error: `Backfill failed: ${res.error}` };
}

/** Attach a certificate reference (co/health/phyto) to a contract. */
export async function setContractCertRef(params: {
  contractId: string;
  certType: RequiredCert;
  ref: ContractCertRef;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();
  const wf = await readWorkflow(admin, params.contractId);
  if (!wf) return { ok: false, error: "Contract not found" };
  const certs = { ...wf.certs, [params.certType]: params.ref };
  const res = await writeWorkflow(admin, params.contractId, wf.currentStage, wf.history, certs);
  return res.ok ? { ok: true } : { ok: false, error: `Cert update failed: ${res.error}` };
}

/** Remove a certificate reference from a contract. */
export async function clearContractCertRef(params: {
  contractId: string;
  certType: RequiredCert;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();
  const wf = await readWorkflow(admin, params.contractId);
  if (!wf) return { ok: false, error: "Contract not found" };
  if (!wf.certs[params.certType]) return { ok: true };
  const certs = { ...wf.certs };
  delete certs[params.certType];
  const res = await writeWorkflow(admin, params.contractId, wf.currentStage, wf.history, certs);
  return res.ok ? { ok: true } : { ok: false, error: `Cert clear failed: ${res.error}` };
}

/** Compute the next contract sequence for (year, prefix) via the DB RPC. */
export async function getNextSequence(
  params: { year: number; prefix: string }
): Promise<{ ok: true; sequence: number } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("next_contract_sequence", {
    p_year: params.year,
    p_prefix: params.prefix,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, sequence: (data as number | null) ?? 7001 };
}
