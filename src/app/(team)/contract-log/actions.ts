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
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { logAuditEvent } from "@/lib/audit/log";
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

/**
 * Build the editable *content* columns of a contract row from the Master Data
 * form shape. This is the single source of truth for the content write path —
 * both `saveContract` (create / re-submit) and `editContract` (super-admin fix)
 * go through it, so the column mapping never drifts between the two.
 *
 * NOTE: this deliberately does NOT set contract_no / invoice_no / current_stage
 * / workflow_history / status — those are owned by the respective callers.
 */
function buildContentColumns(
  input: SalesContractData,
  opts: { seq: number; firstProduct: string; workflow: ContractWorkflow }
) {
  const totals = calcTotals(input.lineItems, input.terms?.numberOfContainers);
  const buyerId = isUuid(input.buyer?.id) ? input.buyer.id! : null;
  const sellerId = isUuid(input.sellerId) ? input.sellerId : null;

  // Reflect the resolved sequence back into the stored snapshot.
  const snapshot: SalesContractData = {
    ...input,
    identifiers: { ...input.identifiers, sequenceNumber: opts.seq },
    workflow: opts.workflow,
  };

  return {
    buyer_id: buyerId,
    seller_id: sellerId,
    contract_date: normalizeDate(input.identifiers.contractDate),
    line_items: input.lineItems,
    terms: input.terms ?? null,
    totals,
    bl_number: input.blNumber ?? null,
    containers: input.containers ?? [],
    master_snapshot: snapshot,
    product_label: opts.firstProduct || null,
  };
}

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

  // saveContract owns the initial workflow stage. New contracts start at
  // "docs-generated"; the costed/etc. stages advance via the StageStrip UI.
  const workflow: ContractWorkflow = input.workflow ?? {
    currentStage: "docs-generated",
    history: { "docs-generated": { completedAt: new Date().toISOString(), by: "auto" } },
  };

  const row = {
    contract_no: contractNo,
    invoice_no: invoiceNo,
    ...buildContentColumns(input, { seq, firstProduct, workflow }),
    current_stage: workflow.currentStage,
    // workflow_history holds BOTH the stage history and the cert refs.
    workflow_history: { history: workflow.history ?? {}, certs: workflow.certs ?? {} },
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

/** Strip bulky / noisy fields (e.g. the seller stamp data-URL) before diffing. */
function sanitizeForAudit(snap: SalesContractData | null): SalesContractData | null {
  if (!snap) return null;
  const clone = structuredClone(snap);
  if (clone.seller) delete (clone.seller as { stamp?: string }).stamp;
  return clone;
}

/** Shallow per-section diff of two snapshots: { section: { before, after } }. */
function diffSnapshots(
  before: SalesContractData | null,
  after: SalesContractData | null
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  for (const k of keys) {
    const b = (before as Record<string, unknown> | null)?.[k] ?? null;
    const a = (after as Record<string, unknown> | null)?.[k] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[k] = { before: b, after: a };
    }
  }
  return changes;
}

/**
 * Super-admin contract correction. Overwrites the editable CONTENT of an
 * existing contract (products, quantities, weights, prices, buyer/consignee,
 * ports, terms, etc. — anything that could be a data-entry mistake) and its
 * `master_snapshot`, then appends an `audit_log` row recording who changed what.
 *
 * Locked / preserved on purpose:
 *   - contract_no / invoice_no — tie SC/CI/PL/Freight together; never change.
 *   - current_stage / workflow_history — workflow is untouched by a content fix.
 *   - status — a correction must not silently reactivate a Cancelled contract.
 *   - bl_number / containers columns — owned by the Shipping Docs page; not
 *     clobbered here (the form has no canonical editor for them).
 *
 * Guarded by requireSuperAdmin() — team users are rejected (defense in depth;
 * the UI only surfaces this action to super admins).
 */
export async function editContract(
  input: SalesContractData & { id: string }
): Promise<SaveContractResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!isUuid(input.id)) return { ok: false, error: "Invalid contract id" };
  const admin = createAdminClient();

  // Read the existing row: numbers are locked, workflow preserved, and we need
  // the prior snapshot + totals for the audit diff.
  const { data: existing, error: readErr } = await admin
    .from("contracts")
    .select("contract_no, invoice_no, master_snapshot, totals")
    .eq("id", input.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: `Read failed: ${readErr.message}` };
  if (!existing) return { ok: false, error: "Contract not found" };

  const e = existing as {
    contract_no: string;
    invoice_no: string;
    master_snapshot: SalesContractData | null;
    totals: unknown;
  };

  const firstProduct = String(input.lineItems?.[0]?.product ?? "");
  const seq =
    typeof input.identifiers.sequenceNumber === "number" && input.identifiers.sequenceNumber > 0
      ? input.identifiers.sequenceNumber
      : e.master_snapshot?.identifiers.sequenceNumber ?? 0;

  // Preserve the original workflow — a content edit never advances/resets stages.
  const workflow: ContractWorkflow =
    input.workflow ??
    e.master_snapshot?.workflow ?? { currentStage: "docs-generated", history: {} };

  const content = buildContentColumns(input, { seq, firstProduct, workflow });

  // Only the editable content columns are written — see the locked/preserved
  // list in this function's doc comment.
  const editable = {
    buyer_id: content.buyer_id,
    seller_id: content.seller_id,
    contract_date: content.contract_date,
    line_items: content.line_items,
    terms: content.terms,
    totals: content.totals,
    master_snapshot: content.master_snapshot,
    product_label: content.product_label,
  };

  const { error: updErr } = await admin.from("contracts").update(editable).eq("id", input.id);
  if (updErr) return { ok: false, error: `Update failed: ${updErr.message}` };

  // Audit (best-effort — never blocks the save). Record old → new content diff.
  const changes = diffSnapshots(
    sanitizeForAudit(e.master_snapshot),
    sanitizeForAudit(content.master_snapshot)
  );
  await logAuditEvent({
    actorUserId: guard.userId,
    actorEmail: guard.email,
    actorRole: "super_admin",
    action: "contract_edit",
    targetResourceType: "contract",
    targetResourceId: input.id,
    metadata: {
      contractNo: e.contract_no,
      invoiceNo: e.invoice_no,
      changedFields: Object.keys(changes),
      changes,
      totalsBefore: e.totals ?? null,
      totalsAfter: content.totals,
    },
  });

  return { ok: true, contractId: input.id, contractNo: e.contract_no, invoiceNo: e.invoice_no };
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
