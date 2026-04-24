"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";
import { downloadContractPdfs, DOC_LABELS, type QuickShareDoc } from "@/lib/quick-share/download";

interface Props {
  data: SalesContractData;
  totals: ContractTotals;
  contractNo: string;
  invoiceNo: string;
}

export default function DownloadAllButton({ data, contractNo, invoiceNo }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number; label: string } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const handleDownloadAll = useCallback(async () => {
    const selected: QuickShareDoc[] = ["sc", "ci", "ci-customs", "pl"];
    setDownloading(true);
    setProgress(null);
    try {
      const result = await downloadContractPdfs(data, contractNo, invoiceNo, selected, {
        onProgress: (doc, index, total) => setProgress({ index, total, label: DOC_LABELS[doc] }),
        onFallbackNotice: (m) => showToast("info", m),
      });
      const total = selected.length;
      if (result.cancelled && result.saved === 0) {
        showToast("info", "Download cancelled.");
      } else if (result.cancelled) {
        showToast("info", `Saved ${result.saved} of ${total}. Cancelled before finishing.`);
      } else {
        showToast("success", `Saved ${result.saved} document${result.saved === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      showToast("error", (err as Error).message || "Download failed");
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }, [data, contractNo, invoiceNo, showToast]);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        size="lg"
        variant="outline"
        className="gap-2"
        disabled={downloading}
        onClick={handleDownloadAll}
      >
        {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        {downloading ? "Saving\u2026" : "Download All Documents"}
      </Button>
      {progress && (
        <p className="text-xs text-blue-600">
          Saving {progress.index} of {progress.total}: {progress.label}
        </p>
      )}
      {toast && (
        <p className={`text-xs ${
          toast.type === "success" ? "text-emerald-600" :
          toast.type === "error" ? "text-red-600" :
          "text-zinc-500"
        }`}>
          {toast.msg}
        </p>
      )}
    </div>
  );
}
