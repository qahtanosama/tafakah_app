import { createClient } from "@/lib/supabase/client";
import type { PaymentReceipt } from "@/types/payment-receipt";

const BUCKET = "payment-receipts";
const BLOCKED_EXTENSIONS = [
  "exe", "bat", "sh", "ps1", "cmd", "js", "vbs", "scr", "msi",
  "app", "dmg", "deb", "rpm", "com", "pif", "jar", "wsf", "htm", "html",
];
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

function isBlockedFileType(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BLOCKED_EXTENSIONS.includes(ext);
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (cleaned.length <= 100) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  if (dot === -1) return cleaned.slice(0, 100);
  return cleaned.slice(0, 90) + cleaned.slice(dot);
}

interface ReceiptRow {
  id: string;
  contract_id: string;
  payment_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  uploaded_by_role: "team" | "client";
  is_archived: boolean | null;
}

function dbToLocalReceipt(row: ReceiptRow): PaymentReceipt {
  return {
    id: row.id,
    contractId: row.contract_id,
    paymentId: row.payment_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type ?? undefined,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by ?? undefined,
    uploadedByRole: row.uploaded_by_role,
    isArchived: row.is_archived ?? false,
  };
}

export async function uploadReceipt(
  contractId: string,
  paymentId: string,
  file: File,
  uploadedByRole: "team" | "client",
): Promise<PaymentReceipt> {
  if (isBlockedFileType(file)) {
    throw new Error(`File type "${file.name.split(".").pop()}" not allowed for security reasons.`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(`File too large. Max ${MAX_SIZE_BYTES / 1024 / 1024} MB.`);
  }

  const path = `${contractId}/${paymentId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const supabase = createClient();

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("payment_receipts")
    .insert({
      contract_id: contractId,
      payment_id: paymentId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: user?.id ?? null,
      uploaded_by_role: uploadedByRole,
    })
    .select()
    .single();

  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`Failed to save receipt metadata: ${error?.message ?? "unknown error"}`);
  }

  return dbToLocalReceipt(data as ReceiptRow);
}

export async function listReceipts(contractId: string, paymentId: string): Promise<PaymentReceipt[]> {
  const { data, error } = await createClient()
    .from("payment_receipts")
    .select("*")
    .eq("contract_id", contractId)
    .eq("payment_id", paymentId)
    .eq("is_archived", false)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(`Failed to list receipts: ${error.message}`);
  return ((data ?? []) as ReceiptRow[]).map(dbToLocalReceipt);
}

export async function getReceiptViewUrl(receipt: PaymentReceipt): Promise<string> {
  const { data, error } = await createClient().storage
    .from(BUCKET)
    .createSignedUrl(receipt.storagePath, 3600);
  if (error || !data) throw new Error(`Failed to generate view URL: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}

export async function archiveReceipt(receiptId: string, storagePath: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("payment_receipts")
    .update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq("id", receiptId);
  if (error) throw new Error(`Failed to archive receipt: ${error.message}`);
  await supabase.storage.from(BUCKET).remove([storagePath]);
}
