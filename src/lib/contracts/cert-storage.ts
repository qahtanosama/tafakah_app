// Shared client/server helpers for cert uploads to the `contract-documents`
// bucket. The browser uploads the blob DIRECTLY to Supabase Storage (the
// bucket's team-only RLS write policy authorizes it), then registers the row
// via the `finalizeCertUpload` server action. Keeping the file bytes out of
// the Server Action body avoids the request-size limits that used to reject
// large scanned certificates.

export const CONTRACT_DOCUMENTS_BUCKET = "contract-documents";
export const MAX_CERT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// `bl` = bill of lading. The DB check constraint allows
// sc, ci, ci-customs, pl, co, health, phyto, bl, other.
export type CertDocType = "co" | "bl" | "phyto" | "health" | "other";
export const ALLOWED_CERT_DOC_TYPES = new Set<CertDocType>(["co", "bl", "phyto", "health", "other"]);

export function sanitizeForPath(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "file";
}

export function extOf(name: string, fallback: string): string {
  const m = /\.([^.]+)$/.exec(name);
  return (m?.[1] ?? fallback).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function buildCertStoragePath(
  contractId: string,
  docType: CertDocType,
  fileName: string,
  mimeType: string,
): string {
  const ext = extOf(fileName, mimeType.startsWith("image/") ? "jpg" : "pdf");
  const timestamp = Date.now();
  return docType === "other"
    ? `contracts/${contractId}/certs/other-${timestamp}-${sanitizeForPath(fileName)}.${ext}`
    : `contracts/${contractId}/certs/${docType}-${timestamp}.${ext}`;
}
