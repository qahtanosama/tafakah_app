"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONTRACT_DOCUMENTS_BUCKET,
  MAX_CERT_SIZE_BYTES,
  ALLOWED_CERT_DOC_TYPES,
  type CertDocType,
} from "./cert-storage";

export type UploadCertResult =
  | { ok: true; documentId: string; storagePath: string }
  | { ok: false; error: string };

async function requireTeam(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };
  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", userData.user.id)
    .single();
  if (!profile || profile.role !== "team" || !profile.is_active) {
    return { ok: false, error: "Team access required" };
  }
  return { ok: true, userId: userData.user.id };
}

interface FinalizeInput {
  contractId: string;
  docType: CertDocType;
  /** Path the browser just uploaded to — must live under this contract's certs/ folder. */
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Optional AI-classifier output to persist alongside the file. */
  aiMetadata?: Record<string, unknown> | null;
}

/**
 * Register a cert the browser already uploaded straight to Storage.
 *
 * The file bytes never pass through this action — Server Action bodies are
 * size-limited, and scanned health/phyto certificates routinely run to tens
 * of megabytes. The browser uploads with the RLS-scoped client (team-only
 * bucket write policy), then calls this to archive any replaced cert and
 * insert the metadata row.
 */
export async function finalizeCertUpload(input: FinalizeInput): Promise<UploadCertResult> {
  try {
    const guard = await requireTeam();
    if (!guard.ok) return { ok: false, error: guard.error };

    if (!input.contractId || !input.docType || !input.fileName || !input.storagePath) {
      return { ok: false, error: "Missing required fields" };
    }
    if (!ALLOWED_CERT_DOC_TYPES.has(input.docType)) {
      return { ok: false, error: `Unsupported docType: ${input.docType}` };
    }

    // The client re-submits the path it uploaded to; pin it to this
    // contract's certs/ folder so a row can't point anywhere else.
    const certsFolder = `contracts/${input.contractId}/certs`;
    const leaf = input.storagePath.startsWith(`${certsFolder}/`)
      ? input.storagePath.slice(certsFolder.length + 1)
      : "";
    if (!leaf || leaf.includes("/") || leaf.includes("..")) {
      return { ok: false, error: "Invalid storage path" };
    }

    const admin = createAdminClient();

    // Confirm the blob actually landed and read its true size before
    // registering the row.
    const { data: objects, error: listError } = await admin.storage
      .from(CONTRACT_DOCUMENTS_BUCKET)
      .list(certsFolder, { search: leaf });
    if (listError) return { ok: false, error: `Storage check failed: ${listError.message}` };
    const object = objects?.find((o) => o.name === leaf);
    if (!object) return { ok: false, error: "Uploaded file not found in storage" };
    const sizeBytes = (object.metadata as { size?: number } | null)?.size ?? input.sizeBytes;
    if (sizeBytes > MAX_CERT_SIZE_BYTES) {
      await admin.storage.from(CONTRACT_DOCUMENTS_BUCKET).remove([input.storagePath]);
      return { ok: false, error: `File too large (max 50 MB, got ${(sizeBytes / 1024 / 1024).toFixed(1)} MB)` };
    }

    // Replacement semantics: for any non-"other" type, archive + remove the
    // currently-active row (and its blob) BEFORE inserting the new one. The
    // partial unique index `(contract_id, doc_type) where is_archived = false
    // and doc_type <> 'other'` would otherwise reject the insert.
    if (input.docType !== "other") {
      const { data: existing } = await admin
        .from("contract_documents")
        .select("id, storage_path")
        .eq("contract_id", input.contractId)
        .eq("doc_type", input.docType)
        .eq("is_archived", false);

      for (const old of (existing ?? []) as Array<{ id: string; storage_path: string | null }>) {
        await admin
          .from("contract_documents")
          .update({ is_archived: true, archived_at: new Date().toISOString() })
          .eq("id", old.id);
        if (old.storage_path && old.storage_path !== input.storagePath) {
          await admin.storage.from(CONTRACT_DOCUMENTS_BUCKET).remove([old.storage_path]);
        }
      }
    }

    const { data: doc, error: insertError } = await admin
      .from("contract_documents")
      .insert({
        contract_id: input.contractId,
        doc_type: input.docType,
        storage_path: input.storagePath,
        file_name: input.fileName,
        mime_type: input.mimeType || null,
        size_bytes: sizeBytes,
        file_size: sizeBytes,
        is_archived: false,
        ai_metadata: input.aiMetadata ?? null,
        uploaded_by: guard.userId,
      })
      .select("id")
      .single();

    if (insertError || !doc) {
      // Rollback: drop the orphan blob.
      await admin.storage.from(CONTRACT_DOCUMENTS_BUCKET).remove([input.storagePath]);
      return { ok: false, error: `Insert failed: ${insertError?.message ?? "unknown"}` };
    }

    return { ok: true, documentId: doc.id as string, storagePath: input.storagePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteCertificate(documentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const guard = await requireTeam();
    if (!guard.ok) return { ok: false, error: guard.error };

    const admin = createAdminClient();
    const { data: doc } = await admin
      .from("contract_documents")
      .select("id, storage_path")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc) return { ok: false, error: "Document not found" };

    await admin
      .from("contract_documents")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq("id", documentId);

    const path = (doc as { storage_path: string | null }).storage_path;
    if (path) {
      await admin.storage.from(CONTRACT_DOCUMENTS_BUCKET).remove([path]);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
