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
import type { WorkflowStage, StageCompletion, ContractWorkflow } from "@/types/workflow";

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
    workflow_history: workflow.history ?? {},
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

/**
 * Advance (or set) a contract's workflow stage and append a completion entry
 * to workflow_history. Server-side mirror of src/lib/workflow.ts advanceStage.
 */
export async function advanceStage(params: {
  contractId: string;
  newStage: WorkflowStage;
  completion?: Omit<StageCompletion, "completedAt">;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();

  const { data: existing, error: selErr } = await admin
    .from("contracts")
    .select("workflow_history")
    .eq("id", params.contractId)
    .maybeSingle();
  if (selErr) return { ok: false, error: `Load failed: ${selErr.message}` };
  if (!existing) return { ok: false, error: "Contract not found" };

  const history = ((existing as { workflow_history?: unknown }).workflow_history ?? {}) as Partial<
    Record<WorkflowStage, StageCompletion>
  >;
  const entry: StageCompletion = {
    ...(params.completion ?? { by: "manual" as const }),
    completedAt: new Date().toISOString(),
  };
  const nextHistory = { ...history, [params.newStage]: entry };

  const { error } = await admin
    .from("contracts")
    .update({ current_stage: params.newStage, workflow_history: nextHistory })
    .eq("id", params.contractId);
  if (error) return { ok: false, error: `Advance failed: ${error.message}` };
  return { ok: true };
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
