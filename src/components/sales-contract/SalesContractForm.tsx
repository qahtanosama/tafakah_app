"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActiveContract } from "@/types/sales-contract";
import { calcTotals } from "@/lib/sales-contract";
import { loadActiveContract } from "@/lib/master-data";

const SalesContractPDFDownload = dynamic(
  () => import("./SalesContractPDFDownload"),
  { ssr: false }
);

function formatDate(d: string): string {
  if (!d) return "\u2014";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  if (!iso) return "\u2014";
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
  const [active, setActive] = useState<ActiveContract | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setActive(loadActiveContract());
    setLoaded(true);
  }, []);

  const data = active?.data ?? null;

  const totals = useMemo(
    () => (data ? calcTotals(data.lineItems) : null),
    [data]
  );

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        Loading...
      </div>
    );
  }

  if (!active || !data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-20 text-center">
        <FileX className="h-12 w-12 text-zinc-400" />
        <h2 className="text-xl font-bold">No Contract Submitted Yet</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Fill in the Master Data Sheet and click &ldquo;Submit Contract&rdquo; to generate documents.
        </p>
        <Link href="/master">
          <Button size="lg">Go to Master Data</Button>
        </Link>
      </div>
    );
  }

  const { contractNo, invoiceNo, dateSubmitted } = active;
  const filledItems = data.lineItems.filter((item) => item.product);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      {/* Active contract banner */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-4 dark:border-emerald-800 dark:bg-emerald-950">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Showing contract <span className="font-bold">{contractNo}</span> &mdash; submitted {formatDateTime(dateSubmitted)}
        </p>
      </div>

      {/* Contract & Invoice Number Banner */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-zinc-50 px-6 py-4 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Contract Number</p>
          <p className="text-2xl font-bold tracking-tight">
            {contractNo || "\u2014"}
          </p>
        </div>
        <div className="rounded-lg border bg-zinc-50 px-6 py-4 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Invoice Number</p>
          <p className="text-2xl font-bold tracking-tight">
            {invoiceNo || "\u2014"}
          </p>
        </div>
      </div>

      {/* Preview: Parties */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Seller</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-semibold">{data.seller.company}</p>
            <p className="text-zinc-600 dark:text-zinc-400">{data.seller.address}</p>
            <p className="text-zinc-600 dark:text-zinc-400">Tel: {data.seller.tel}</p>
            <p className="text-zinc-600 dark:text-zinc-400">Email: {data.seller.email}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Buyer / Consignee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-semibold">{data.buyer.company || "\u2014"}</p>
            <p className="text-zinc-600 dark:text-zinc-400">{data.buyer.address}</p>
            <p className="text-zinc-600 dark:text-zinc-400">{data.buyer.cityPostal}</p>
            <p className="text-zinc-600 dark:text-zinc-400">Email: {data.buyer.email}</p>
          </CardContent>
        </Card>
      </div>

      {/* Preview: Dates & IDs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Document Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><span className="text-zinc-500">Contract Date:</span> {formatDate(data.identifiers.contractDate)}</div>
            <div><span className="text-zinc-500">Invoice Date:</span> {formatDate(data.identifiers.invoiceDate)}</div>
            <div><span className="text-zinc-500">Seal No:</span> {data.identifiers.sealNumber || "\u2014"}</div>
            <div><span className="text-zinc-500">Container No:</span> {data.identifiers.containerNumber || "\u2014"}</div>
            <div><span className="text-zinc-500">B/L No:</span> {data.identifiers.blNumber || "\u2014"}</div>
          </div>
        </CardContent>
      </Card>

      {/* Preview: Shipping */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Shipping & Delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><span className="text-zinc-500">Loading Port:</span> {data.shipping.loadingPort}</div>
            <div><span className="text-zinc-500">Discharge Port:</span> {data.shipping.dischargePort || "\u2014"}</div>
            <div><span className="text-zinc-500">Incoterm:</span> {data.shipping.incoterm}</div>
            <div><span className="text-zinc-500">Origin:</span> {data.shipping.origin}</div>
            <div><span className="text-zinc-500">Delivery From:</span> {formatDate(data.shipping.deliveryFrom)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Preview: Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Goods ({filledItems.length} item{filledItems.length !== 1 ? "s" : ""})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-4">Product</th>
                  <th className="pb-2 pr-4">HS Code</th>
                  <th className="pb-2 pr-4 text-right">N.W./Ctn</th>
                  <th className="pb-2 pr-4 text-right">Cartons</th>
                  <th className="pb-2 pr-4 text-right">Qty MTS</th>
                  <th className="pb-2 pr-4 text-right">Price/MT</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filledItems.map((item, i) => {
                  const cartons = typeof item.cartons === "number" ? item.cartons : 0;
                  const amount = item.pricePerCarton * cartons;
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{item.product}</td>
                      <td className="py-2 pr-4">{item.hsCode}</td>
                      <td className="py-2 pr-4 text-right">{item.nwPerCarton !== "" ? fmt(item.nwPerCarton as number) : "\u2014"}</td>
                      <td className="py-2 pr-4 text-right">{cartons || "\u2014"}</td>
                      <td className="py-2 pr-4 text-right">{fmt(item.qtyMTS, 3)}</td>
                      <td className="py-2 pr-4 text-right">{item.pricePerMT !== "" ? fmtUSD(item.pricePerMT as number) : "\u2014"}</td>
                      <td className="py-2 text-right font-medium">{fmtUSD(amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totals && (
            <div className="mt-4 flex justify-end">
              <div className="rounded-md border bg-emerald-50 px-4 py-2 text-right dark:bg-emerald-950">
                <span className="text-xs text-zinc-500">Total: </span>
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {fmtUSD(totals.totalUSD)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Actions */}
      <div className="flex flex-col items-center gap-4 pb-12">
        <SalesContractPDFDownload
          data={data}
          totals={totals!}
          contractNumber={contractNo}
        />
        <Link href="/master" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          Edit Master Data
        </Link>
      </div>
    </div>
  );
}
