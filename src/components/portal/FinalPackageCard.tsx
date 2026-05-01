"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileArchive, Download, Loader2, AlertTriangle } from "lucide-react";
import { formatDate, type AppLocale } from "@/lib/i18n/format";

interface Props {
  contractId: string;
  contractNo: string;
  generatedAt: string | null;
  sizeBytes: number | null;
  docCount: number | null;
  locale: AppLocale;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FinalPackageCard({
  contractId,
  contractNo,
  generatedAt,
  sizeBytes,
  docCount,
  locale,
}: Props) {
  const t = useTranslations("portal.contractDetail.finalPackage");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/portal/merged-pdf?contractId=${encodeURIComponent(contractId)}`, {
        credentials: "include",
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        setError(text || `Download failed (${resp.status})`);
        return;
      }
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/i.exec(disposition);
      const filename = match?.[1] ?? `${contractNo}-final-package.pdf`;
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
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-gold/40 bg-gradient-to-br from-white to-gold/5 p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-navy">{t("title")}</h2>
      <div className="mt-4 flex flex-wrap items-center gap-4 sm:flex-nowrap">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
          <FileArchive className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-navy">{t("heading")}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("subtitle", { count: docCount ?? 0 })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("generatedOn", { date: formatDate(generatedAt, locale) })} &middot;{" "}
            {t("size", { size: formatBytes(sizeBytes) })}
          </p>
          {error && (
            <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-navy px-4 text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t("download")}
        </button>
      </div>
    </section>
  );
}
