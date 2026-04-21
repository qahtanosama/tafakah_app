"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FileX, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActiveContract } from "@/types/sales-contract";
import { calcTotals } from "@/lib/sales-contract";
import { loadActiveContract } from "@/lib/master-data";

const CommercialInvoicePDFDownload = dynamic(
  () => import("./CommercialInvoicePDFDownload"),
  { ssr: false }
);

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  variant: "commercial" | "customs";
}

export default function InvoiceForm({ variant }: Props) {
  const [active, setActive] = useState<ActiveContract | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setActive(loadActiveContract());
    setLoaded(true);
  }, []);

  const data = active?.data ?? null;
  const totals = useMemo(() => (data ? calcTotals(data.lineItems) : null), [data]);

  const isCustoms = variant === "customs";
  const priceFactor = isCustoms ? 0.55 : 1;
  const label = isCustoms ? "Customs Invoice" : "Commercial Invoice";
  const filenamePrefix = isCustoms ? "CI-Customs" : "CI";

  if (!loaded) {
    return <div className="flex items-center justify-center py-20 text-slate-500 font-medium">Loading document data...</div>;
  }

  if (!active || !data) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-6 py-24 text-center rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 mt-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 shadow-sm">
          <FileX className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">No Active Contract</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Fill in the Master Data Sheet and click "Submit Contract" to generate a {label}.
          </p>
        </div>
        <Link href="/master">
          <Button className="gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 shadow-md shadow-indigo-500/20">Go to Master Data</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 md:px-8">
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-6 py-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-500/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Previewing <span className="font-bold">{label}</span> for <span className="font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100">{active.contractNo}</span>
          </p>
        </div>
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-500 hidden sm:block">
          Generated {formatDateTime(active.dateSubmitted)}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pb-12 mt-12">
        <CommercialInvoicePDFDownload
          data={data}
          totals={totals!}
          contractNumber={active.contractNo}
          invoiceNumber={active.invoiceNo}
          priceFactor={priceFactor}
          filenamePrefix={filenamePrefix}
        />
        <Link href="/master">
          <Button variant="outline" className="h-12 px-8 font-bold border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-300 shadow-sm">
            Edit Master Data
          </Button>
        </Link>
      </div>
    </div>
  );
}
