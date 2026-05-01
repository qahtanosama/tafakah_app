"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, FileText, Loader2 } from "lucide-react";
import { formatDate, type AppLocale } from "@/lib/i18n/format";

export interface DocumentRowData {
  id: string;
  doc_type: "sc" | "ci" | "pl" | "co" | "health" | "phyto" | "bl" | "other";
  file_name: string;
  uploaded_at: string;
}

export default function DocumentRow({ doc }: { doc: DocumentRowData }) {
  const t = useTranslations("portal.contractDetail");
  const tTypes = useTranslations("portal.documentTypes");
  const locale = useLocale() as AppLocale;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/cert/download?documentId=${encodeURIComponent(doc.id)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setError(text || `Download failed (${res.status})`);
        return;
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/i.exec(disposition);
      const filename = match?.[1] ?? doc.file_name;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy/5 text-navy">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tTypes(doc.doc_type)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {doc.file_name} · {formatDate(doc.uploaded_at, locale)}
        </p>
        {error && <p className="mt-0.5 text-xs text-destructive">{error}</p>}
      </div>
      <button
        onClick={handleDownload}
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-navy bg-white px-3 text-sm font-medium text-navy transition-colors hover:bg-navy hover:text-white disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {t("downloadDoc")}
      </button>
    </div>
  );
}
