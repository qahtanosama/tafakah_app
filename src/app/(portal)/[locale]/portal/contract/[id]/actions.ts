"use server";

import { createClient } from "@/lib/supabase/server";

const DOC_BUCKET = "contract-documents";

/**
 * Generates a short-lived signed URL for a contract document the signed-in
 * client owns. RLS plus the owning-buyer check on contract_documents prevents
 * a client from grabbing another buyer's file.
 */
export async function getDocumentSignedUrl(
  documentId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: doc, error } = await supabase
    .from("contract_documents")
    .select("storage_path, doc_type")
    .eq("id", documentId)
    .single();

  if (error || !doc) return { ok: false, error: "Document not found" };
  if (doc.doc_type === "ci-customs") return { ok: false, error: "Not available" };
  if (!doc.storage_path) return { ok: false, error: "No file attached" };

  const { data: signed, error: signErr } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(doc.storage_path, 60);

  if (signErr || !signed) return { ok: false, error: signErr?.message ?? "Signing failed" };
  return { ok: true, url: signed.signedUrl };
}
