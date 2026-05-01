"use server";

import { createClient } from "@/lib/supabase/server";

export interface CertRow {
  id: string;
  doc_type: "co" | "bl" | "phyto" | "health" | "other" | "sc" | "ci" | "ci-customs" | "pl";
  storage_path: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Lists active (non-archived) cert/document rows for a contract. RLS scopes:
 *   - team users see all
 *   - client users see only rows for contracts they own (via users_profile.buyer_id)
 *
 * Accepts either the DB UUID (preferred) or the human contract_no, since
 * client-side flows often only have the local contract_no.
 *
 * Returns `contractId` so the caller can stash the resolved UUID for
 * subsequent uploads/deletes without re-resolving.
 */
export async function listCertsForContract(
  ref: { contractId: string } | { contractNo: string },
): Promise<
  | { ok: true; contractId: string; rows: CertRow[] }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  let contractId: string | null = "contractId" in ref ? ref.contractId : null;

  if (!contractId) {
    const contractNo = (ref as { contractNo: string }).contractNo;
    if (!contractNo) return { ok: false, error: "Missing contractId or contractNo" };
    const { data: c, error: cErr } = await supabase
      .from("contracts")
      .select("id")
      .eq("contract_no", contractNo)
      .maybeSingle();
    if (cErr) return { ok: false, error: `Resolve contract failed: ${cErr.message}` };
    if (!c) return { ok: false, error: `Contract not in DB: ${contractNo}` };
    contractId = (c as { id: string }).id;
  }

  const { data, error } = await supabase
    .from("contract_documents")
    .select("id, doc_type, storage_path, file_name, mime_type, size_bytes, ai_metadata, created_at:uploaded_at")
    .eq("contract_id", contractId)
    .eq("is_archived", false)
    .order("uploaded_at", { ascending: false });
  if (error) return { ok: false, error: `Failed to list certs: ${error.message}` };
  return { ok: true, contractId, rows: (data ?? []) as unknown as CertRow[] };
}
