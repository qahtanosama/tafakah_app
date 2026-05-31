"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FileX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActiveContract } from "@/types/sales-contract";
import { useContract } from "@/lib/data/contracts";
import { buildContractDocumentData } from "@/lib/contracts/document-data";

const PackingListPDFDownload = dynamic(
  () => import("./PackingListPDFDownload"),
  { ssr: false }
);

function formatDateTime(iso: string): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function PackingListForm() {
  const id = useSearchParams().get("id");
  const { data: row, isLoading } = useContract(id ?? undefined);

  // Shared builder — the SAME data/totals the portal route feeds the PDF.
  const built = useMemo(() => (row ? buildContractDocumentData(row) : null), [row]);
  const active: ActiveContract | null = row && built
    ? {
        data: built.data,
        contractNo: row.contract_no,
        invoiceNo: row.invoice_no,
        dateSubmitted: row.created_at,
      }
    : null;

  const data = active?.data ?? null;
  const totals = built?.totals ?? null;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;
  }

  if (!active || !data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-20 text-center">
        <FileX className="h-12 w-12 text-zinc-400" />
        <h2 className="text-xl font-bold">No Contract Submitted Yet</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Fill in the Master Data Sheet and click &ldquo;Submit Contract&rdquo; to generate a Packing List.
        </p>
        <Link href="/master"><Button size="lg">Go to Master Data</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-4 dark:border-emerald-800 dark:bg-emerald-950">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Showing <span className="font-bold">Packing List</span> for contract{" "}
          <span className="font-bold">{active.contractNo}</span> &mdash; submitted {formatDateTime(active.dateSubmitted)}
        </p>
      </div>
      <div className="flex flex-col items-center gap-4 pb-12">
        <PackingListPDFDownload
          data={data}
          totals={totals!}
          contractNumber={active.contractNo}
          invoiceNumber={active.invoiceNo}
        />
        <Link href="/master" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          Edit Master Data
        </Link>
      </div>
    </div>
  );
}
