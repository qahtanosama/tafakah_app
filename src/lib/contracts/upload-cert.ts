"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "contract-documents";
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

// `bl` = bill of lading. The DB check constraint allows
// sc, ci, ci-customs, pl, co, health, phyto, bl, other.
const ALLOWED_DOC_TYPES = new Set(["co", "bl", "phyto", "health", "other"] as const);
type DocType = "co" | "bl" | "phyto" | "health" | "other";

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

function sanitizeForPath(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "file";
}

function extOf(name: string, fallback: string): string {
  const m = /\.([^.]+)$/.exec(name);
  return (m?.[1] ?? fallback).toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface UploadInput {
  contractId: string;
  docType: DocType;
  fileName: string;
  mimeType: string;
  /** base64 (no data: prefix) — Server Actions can't accept FormData binary cleanly across boundaries, so callers encode. */
  base64: string;
  /** Optional AI-classifier output to persist alongside the file. */
  aiMetadata?: Record<string, unknown> | null;
}

export async function uploadCertificate(input: UploadInput): Promise<UploadCertResult> {
  try {
    const guard = await requireTeam();
    if (!guard.ok) return { ok: false, error: guard.error };

    if (!input.contractId || !input.docType || !input.fileName || !input.base64) {
      return { ok: false, error: "Missing required fields" };
    }
    if (!ALLOWED_DOC_TYPES.has(input.docType)) {
      return { ok: false, error: `Unsupported docType: ${input.docType}` };
    }
    if (input.mimeType && !ALLOWED_MIME_TYPES.has(input.mimeType)) {
      return { ok: false, error: `Unsupported file type: ${input.mimeType}` };
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(input.base64, "base64");
    } catch {
      return { ok: false, error: "Invalid file payload" };
    }
    if (buffer.length === 0) return { ok: false, error: "Empty file" };
    if (buffer.length > MAX_SIZE_BYTES) {
      return { ok: false, error: `File too large (max 50 MB, got ${(buffer.length / 1024 / 1024).toFixed(1)} MB)` };
    }

    const ext = extOf(input.fileName, input.mimeType.startsWith("image/") ? "jpg" : "pdf");
    const timestamp = Date.now();
    const storagePath =
      input.docType === "other"
        ? `contracts/${input.contractId}/certs/other-${timestamp}-${sanitizeForPath(input.fileName)}.${ext}`
        : `contracts/${input.contractId}/certs/${input.docType}-${timestamp}.${ext}`;

    const admin = createAdminClient();

    // Replacement semantics: for any non-"other" type, archive + remove the
    // currently-active row (and its blob) BEFORE uploading the new one. The
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
        if (old.storage_path) {
          await admin.storage.from(STORAGE_BUCKET).remove([old.storage_path]);
        }
      }
    }

    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: input.mimeType || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) return { ok: false, error: `Upload failed: ${uploadError.message}` };

    const { data: doc, error: insertError } = await admin
      .from("contract_documents")
      .insert({
        contract_id: input.contractId,
        doc_type: input.docType,
        storage_path: storagePath,
        file_name: input.fileName,
        mime_type: input.mimeType || null,
        size_bytes: buffer.length,
        file_size: buffer.length,
        is_archived: false,
        ai_metadata: input.aiMetadata ?? null,
        uploaded_by: guard.userId,
      })
      .select("id")
      .single();

    if (insertError || !doc) {
      // Rollback: drop the orphan blob.
      await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
      return { ok: false, error: `Insert failed: ${insertError?.message ?? "unknown"}` };
    }

    return { ok: true, documentId: doc.id as string, storagePath };
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
      await admin.storage.from(STORAGE_BUCKET).remove([path]);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
