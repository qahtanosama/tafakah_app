"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";

interface Props {
  contractId: string;
  docType: "sc" | "ci" | "customs" | "pl";
  label: string;
  downloadLabel: string;
}

export default function GeneratedDocDownload({ contractId, docType, label, downloadLabel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/portal/generate-pdf?contractId=${encodeURIComponent(contractId)}&docType=${encodeURIComponent(docType)}`,
        { credentials: "include" },
      );
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        setError(text || `Download failed (${resp.status})`);
        return;
      }
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/i.exec(disposition);
      const filename = match?.[1] ?? `${docType}-${contractId}.pdf`;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message || "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy/5 text-navy">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {error && <p className="mt-0.5 truncate text-xs text-red-600">{error}</p>}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-navy bg-white px-3 text-sm font-medium text-navy transition-colors hover:bg-navy hover:text-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {downloadLabel}
      </button>
    </div>
  );
}
