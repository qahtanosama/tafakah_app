"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileX, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActiveContract } from "@/types/sales-contract";
import { useContract } from "@/lib/data/contracts";
import { buildContractDocumentData } from "@/lib/contracts/document-data";

const SalesContractPDFDownload = dynamic(
  () => import("./SalesContractPDFDownload"),
  { ssr: false }
);

function formatDate(d: string): string {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

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

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmt(n: number, d = 2) {
  return n.toFixed(d);
}

export default function SalesContractForm() {
  const id = useSearchParams().get("id");
  const { data: row, isLoading } = useContract(id ?? undefined);

  // Shared builder: folds the live B/L + containers over the frozen snapshot and
  // computes totals — the SAME data the portal route feeds the PDF. The SC then
  // shows containers once shipping assigns them. See document-data.ts.
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
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 font-medium">
        Loading document preview...
      </div>
    );
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
            Fill in the Master Data Sheet and click "Submit Contract" to generate documents.
          </p>
        </div>
        <Link href="/master">
          <Button className="gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 shadow-md shadow-indigo-500/20">Go to Master Data</Button>
        </Link>
      </div>
    );
  }

  const { contractNo, invoiceNo, dateSubmitted } = active;
  const filledItems = data.lineItems.filter((item) => item.product);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 md:px-8">
      {/* Active contract banner */}
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-6 py-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-500/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Previewing Contract <span className="font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100">{contractNo}</span>
          </p>
        </div>
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-500 hidden sm:block">
          Generated {formatDateTime(dateSubmitted)}
        </p>
      </div>

      {/* Contract & Invoice Number Banner */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Contract Number</p>
            <p className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white font-mono">
              {contractNo || "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Invoice Number</p>
            <p className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white font-mono">
              {invoiceNo || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Preview: Parties */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 pb-3">
            <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Seller</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm p-6">
            <p className="font-bold text-base text-slate-800 dark:text-slate-100">{data.seller.company}</p>
            <p className="text-slate-600 dark:text-slate-400 font-medium">{data.seller.address}</p>
            <p className="text-slate-600 dark:text-slate-400 font-medium">Tel: <span className="text-slate-800 dark:text-slate-300">{data.seller.tel}</span></p>
            <p className="text-slate-600 dark:text-slate-400 font-medium">Email: <span className="text-slate-800 dark:text-slate-300">{data.seller.email}</span></p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 pb-3">
            <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Buyer / Consignee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm p-6">
            <p className="font-bold text-base text-slate-800 dark:text-slate-100">{data.buyer.company || "—"}</p>
            <p className="text-slate-600 dark:text-slate-400 font-medium">{data.buyer.address}</p>
            <p className="text-slate-600 dark:text-slate-400 font-medium">{data.buyer.cityPostal}</p>
            <p className="text-slate-600 dark:text-slate-400 font-medium">Email: <span className="text-slate-800 dark:text-slate-300">{data.buyer.email}</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Preview: Dates & IDs */}
      <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 pb-3">
          <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Document Details</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3 font-medium">
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Contract Date</span> <span className="text-slate-800 dark:text-slate-200">{formatDate(data.identifiers.contractDate)}</span></div>
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Invoice Date</span> <span className="text-slate-800 dark:text-slate-200">{formatDate(data.identifiers.invoiceDate)}</span></div>
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Seal No</span> <span className="text-slate-800 dark:text-slate-200 font-mono bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded w-fit">{data.identifiers.sealNumber || "—"}</span></div>
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Container No</span> <span className="text-slate-800 dark:text-slate-200 font-mono bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded w-fit">{data.identifiers.containerNumber || "—"}</span></div>
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">B/L No</span> <span className="text-slate-800 dark:text-slate-200 font-mono bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded w-fit">{data.identifiers.blNumber || "—"}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Preview: Shipping */}
      <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 pb-3">
          <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Shipping & Delivery</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3 font-medium">
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Loading Port</span> <span className="text-slate-800 dark:text-slate-200">{data.shipping.loadingPort}</span></div>
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Discharge Port</span> <span className="text-slate-800 dark:text-slate-200">{data.shipping.dischargePort || "—"}</span></div>
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Incoterm</span> <span className="text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded w-fit border border-indigo-100 dark:border-indigo-800/30">{data.shipping.incoterm}</span></div>
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Origin</span> <span className="text-slate-800 dark:text-slate-200">{data.shipping.origin}</span></div>
            <div className="flex flex-col gap-1"><span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">Delivery From</span> <span className="text-slate-800 dark:text-slate-200">{formatDate(data.shipping.deliveryFrom)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Preview: Line Items */}
      <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 pb-3">
          <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Goods Overview <span className="ml-2 bg-white dark:bg-zinc-800 text-slate-500 px-2 py-0.5 rounded-full text-xs font-semibold">{filledItems.length} item{filledItems.length !== 1 ? "s" : ""}</span></CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 pl-6 pr-4">Product</th>
                  <th className="py-3 pr-4">HS Code</th>
                  <th className="py-3 pr-4 text-right">N.W./Ctn</th>
                  <th className="py-3 pr-4 text-right">Cartons</th>
                  <th className="py-3 pr-4 text-right">Qty MTS</th>
                  <th className="py-3 pr-4 text-right">Price/MT</th>
                  <th className="py-3 pr-6 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="font-medium text-slate-700 dark:text-slate-300">
                {filledItems.map((item, i) => {
                  const cartons = typeof item.cartons === "number" ? item.cartons : 0;
                  const amount = item.pricePerCarton * cartons;
                  return (
                    <tr key={i} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="py-3 pl-6 pr-4 font-bold text-slate-800 dark:text-slate-100">{item.product}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{item.hsCode}</td>
                      <td className="py-3 pr-4 text-right">{item.nwPerCarton !== "" ? fmt(item.nwPerCarton as number) : "—"}</td>
                      <td className="py-3 pr-4 text-right">{cartons || "—"}</td>
                      <td className="py-3 pr-4 text-right font-mono">{fmt(item.qtyMTS, 3)}</td>
                      <td className="py-3 pr-4 text-right font-mono">{item.pricePerMT !== "" ? fmtUSD(item.pricePerMT as number) : "—"}</td>
                      <td className="py-3 pr-6 text-right font-mono font-bold text-slate-800 dark:text-white">{fmtUSD(amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totals && (
            <div className="p-6 bg-slate-50/50 dark:bg-white/5 flex justify-end">
              <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-900/20 px-6 py-3 text-right flex items-center gap-6">
                <span className="text-sm font-bold text-indigo-900/60 dark:text-indigo-100/50 uppercase tracking-wider">Total Value</span>
                <span className="text-2xl font-black text-indigo-700 dark:text-indigo-400 tracking-tight font-mono">
                  {fmtUSD(totals.totalUSD)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="bg-slate-200 dark:bg-white/10" />

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pb-12">
        <SalesContractPDFDownload
          data={data}
          totals={totals!}
          contractNumber={contractNo}
        />
        <Link href="/master">
          <Button variant="outline" className="h-12 px-8 font-bold border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-300">
            Edit Master Data
          </Button>
        </Link>
      </div>
    </div>
  );
}
