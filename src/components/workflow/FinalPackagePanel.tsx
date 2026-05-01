"use client";

import { useCallback, useEffect, useState } from "react";
import { FileArchive, Loader2, Download, RefreshCw, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { generateMergedPdfForContract } from "@/lib/contracts/generate-merged-pdf";

interface Props {
  contractNo: string;
}

interface MergedMeta {
  contract_id: string;
  merged_pdf_path: string | null;
  merged_pdf_generated_at: string | null;
  merged_pdf_size_bytes: number | null;
  merged_pdf_doc_count: number | null;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function FinalPackagePanel({ contractNo }: Props) {
  const [meta, setMeta] = useState<MergedMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const { data, error: dbErr } = await supabase
      .from("contracts")
      .select("id, merged_pdf_path, merged_pdf_generated_at, merged_pdf_size_bytes, merged_pdf_doc_count")
      .eq("contract_no", contractNo)
      .maybeSingle();
    if (dbErr) {
      setError(dbErr.message);
      setMeta(null);
    } else if (data) {
      setMeta({
        contract_id: data.id as string,
        merged_pdf_path: (data.merged_pdf_path as string | null) ?? null,
        merged_pdf_generated_at: (data.merged_pdf_generated_at as string | null) ?? null,
        merged_pdf_size_bytes: (data.merged_pdf_size_bytes as number | null) ?? null,
        merged_pdf_doc_count: (data.merged_pdf_doc_count as number | null) ?? null,
      });
    } else {
      setMeta(null);
    }
    setLoaded(true);
  }, [contractNo]);

  useEffect(() => {
    void load();
  }, [load]);

  const onGenerate = useCallback(
    async (regenerate: boolean) => {
      if (regenerate && !confirm("Regenerate the Final Document Package? This will replace the current file.")) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await generateMergedPdfForContract({ contractNo });
        if (!result.ok) {
          setError(result.error);
        } else {
          await load();
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [contractNo, load],
  );

  const onDownload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/portal/merged-pdf?contractNo=${encodeURIComponent(contractNo)}`, {
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
  }, [contractNo]);

  if (!loaded) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border bg-white p-3 text-xs text-zinc-500 dark:bg-zinc-900">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Final Document Package…
      </div>
    );
  }

  if (!meta) {
    return null; // contract not in DB yet
  }

  const hasPackage = !!meta.merged_pdf_path;

  return (
    <div className="mt-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2">
        <FileArchive className="h-4 w-4 text-indigo-600" />
        <p className="font-semibold">Final Document Package</p>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {hasPackage ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span>{meta.merged_pdf_doc_count ?? "?"} document(s) merged</span>
            <span>·</span>
            <span>{formatBytes(meta.merged_pdf_size_bytes)}</span>
            <span>·</span>
            <span>Generated {formatTimestamp(meta.merged_pdf_generated_at)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onDownload} disabled={busy} className="gap-1">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download
            </Button>
            <Button size="sm" variant="outline" onClick={() => onGenerate(true)} disabled={busy} className="gap-1">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">No merged package generated yet.</p>
          <Button size="sm" onClick={() => onGenerate(false)} disabled={busy} className="gap-1">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate Now
          </Button>
        </div>
      )}
    </div>
  );
}
