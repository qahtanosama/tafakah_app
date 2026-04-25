"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import {
  File as FileIcon,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  Paperclip,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useReceipts,
  useUploadReceipt,
  useArchiveReceipt,
} from "@/lib/data/payment-receipts";
import { getReceiptViewUrl } from "@/lib/storage/payment-receipts";
import type { PaymentReceipt } from "@/types/payment-receipt";

interface Props {
  contractId: string;
  paymentId: string | undefined;
  isClient?: boolean;
  currentUserId?: string;
}

const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt,.heic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  if (!d) return "";
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function pickIcon(receipt: PaymentReceipt) {
  const ext = receipt.fileName.split(".").pop()?.toLowerCase() ?? "";
  const mime = receipt.mimeType ?? "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return ImageIcon;
  if (ext === "pdf" || mime === "application/pdf") return FileText;
  if (["doc", "docx"].includes(ext)) return FileText;
  if (["xls", "xlsx", "csv"].includes(ext)) return FileSpreadsheet;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return FileArchive;
  return FileIcon;
}

function isImage(receipt: PaymentReceipt): boolean {
  const ext = receipt.fileName.split(".").pop()?.toLowerCase() ?? "";
  const mime = receipt.mimeType ?? "";
  if (mime.startsWith("image/")) return true;
  return ["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext);
}

export default function PaymentReceipts({ contractId, paymentId, isClient = false, currentUserId }: Props) {
  if (!paymentId) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
        title="This payment has no stable id yet."
      >
        <AlertTriangle className="h-3 w-3" />
        Run /admin/migrate &rarr; Backfill payment ids
      </span>
    );
  }
  return (
    <PaymentReceiptsInner
      contractId={contractId}
      paymentId={paymentId}
      isClient={isClient}
      currentUserId={currentUserId}
    />
  );
}

function PaymentReceiptsInner({
  contractId,
  paymentId,
  isClient,
  currentUserId,
}: {
  contractId: string;
  paymentId: string;
  isClient: boolean;
  currentUserId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ index: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PaymentReceipt | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: receipts = [], isLoading } = useReceipts(contractId, paymentId);
  const uploadMut = useUploadReceipt(contractId, paymentId, isClient ? "client" : "team");
  const archiveMut = useArchiveReceipt(contractId, paymentId);

  const flashToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploadProgress({ index: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ index: i + 1, total: files.length });
      const file = files[i];
      try {
        await uploadMut.mutateAsync(file);
        flashToast("success", `Uploaded ${file.name}`);
      } catch (err) {
        flashToast("error", `${file.name}: ${(err as Error).message}`);
      }
    }
    setUploadProgress(null);
    setExpanded(true);
  }, [uploadMut, flashToast]);

  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void uploadFiles(files);
  }, [uploadFiles]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      setExpanded(true);
      void uploadFiles(files);
    }
  }, [uploadFiles]);

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  }, [dragOver]);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setDragOver(false);
  }, []);

  const handleView = useCallback(async (receipt: PaymentReceipt) => {
    try {
      const url = await getReceiptViewUrl(receipt);
      if (isImage(receipt)) {
        setImagePreview({ url, name: receipt.fileName });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      flashToast("error", `View failed: ${(err as Error).message}`);
    }
  }, [flashToast]);

  const canDelete = useCallback((receipt: PaymentReceipt) => {
    if (!isClient) return true;
    return !!currentUserId && receipt.uploadedBy === currentUserId;
  }, [isClient, currentUserId]);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await archiveMut.mutateAsync({ id: target.id, storagePath: target.storagePath });
      flashToast("success", `Deleted ${target.fileName}`);
    } catch (err) {
      flashToast("error", `Delete failed: ${(err as Error).message}`);
    }
  }, [confirmDelete, archiveMut, flashToast]);

  const count = receipts.length;
  const hidden = useMemo(() => (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept={ACCEPT}
      onChange={onPickFiles}
      className="hidden"
    />
  ), [onPickFiles]);

  if (!expanded) {
    return (
      <div className="inline-flex items-center gap-1.5">
        {hidden}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${count > 0 ? "border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" : "text-zinc-400 hover:text-zinc-700"}`}
          title={count === 0 ? "No receipts" : `${count} receipt(s)`}
        >
          <Paperclip className="h-3 w-3" />
          {count > 0 ? count : ""}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!uploadProgress}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
          title="Add receipt"
        >
          {uploadProgress ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {uploadProgress ? `${uploadProgress.index}/${uploadProgress.total}` : "Add"}
        </button>
        {toast && (
          <span className={`text-[11px] ${toast.type === "error" ? "text-red-600" : "text-emerald-600"}`}>{toast.msg}</span>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative rounded-lg border bg-white p-2 shadow-sm dark:bg-zinc-900 ${dragOver ? "border-emerald-400 ring-2 ring-emerald-200" : "border-zinc-200 dark:border-zinc-700"}`}
      >
        {hidden}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <Paperclip className="h-3 w-3" /> Receipts ({count})
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="outline"
              disabled={!!uploadProgress}
              onClick={() => fileInputRef.current?.click()}
              className="gap-1"
            >
              {uploadProgress ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {uploadProgress ? `Uploading ${uploadProgress.index}/${uploadProgress.total}` : "Add"}
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={() => setExpanded(false)} title="Collapse">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading receipts...
          </div>
        )}

        {!isLoading && receipts.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-zinc-400">
            No receipts yet. Drag files here or click + Add.
          </div>
        )}

        {receipts.length > 0 && (
          <ul className="space-y-1">
            {receipts.map((r) => {
              const Icon = pickIcon(r);
              const showDelete = canDelete(r);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-md border border-zinc-100 bg-zinc-50/50 px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-800/30"
                >
                  <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                  <span className="flex-1 truncate font-medium text-zinc-700 dark:text-zinc-200" title={r.fileName}>
                    {r.fileName}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-400">{formatBytes(r.fileSize)}</span>
                  <span className="shrink-0 text-[10px] text-zinc-400">
                    by {r.uploadedByRole} &middot; {formatRelative(r.uploadedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleView(r)}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50"
                    title="View"
                  >
                    <ExternalLink className="h-3 w-3" /> View
                  </button>
                  {showDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(r)}
                      className="inline-flex shrink-0 items-center rounded p-0.5 text-red-500 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-emerald-100/80 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200">
            Drop files here
          </div>
        )}

        {toast && (
          <div className={`mt-2 rounded border px-2 py-1 text-[11px] ${toast.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {toast.msg}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-xl border bg-white p-5 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-semibold">Delete receipt?</h3>
            <p className="mb-4 break-words text-sm text-zinc-600 dark:text-zinc-300">
              Delete &ldquo;{confirmDelete.fileName}&rdquo;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={handleConfirmDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setImagePreview(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="absolute -top-3 -right-3 z-10 rounded-full bg-white p-1.5 text-zinc-700 shadow-lg hover:bg-zinc-100"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview.url}
              alt={imagePreview.name}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
            <a
              href={imagePreview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
            >
              <ExternalLink className="h-3 w-3" /> Open original
            </a>
          </div>
        </div>
      )}
    </>
  );
}
