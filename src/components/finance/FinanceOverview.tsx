"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, DollarSign, TrendingUp, Clock, Trophy, Wallet } from "lucide-react";
import type { ContractFinance } from "@/types/finance";
import { calcTotals } from "@/lib/sales-contract";
import { calcSummary } from "@/lib/finance";
import { useContracts } from "@/lib/data/contracts";
import { useAllFinance, type FinanceRow } from "@/lib/data/finance";
import { Card } from "@/components/ui/card";

/** Adapt a Supabase finance row to the ContractFinance shape calcSummary expects. */
function rowToFinance(row: FinanceRow | undefined): ContractFinance | null {
  if (!row) return null;
  return {
    contractNo: "",
    costs: row.cost_items ?? [],
    payments: row.payments_received ?? [],
    updatedAt: row.updated_at ?? "",
  };
}

function fmtUSD(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30",
  unpaid: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400 border border-slate-200 dark:border-white/10",
  overpaid: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/30",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid", partial: "Partial", unpaid: "Pending", overpaid: "Overpaid",
};

export default function FinanceOverview() {
  const { data: contractRows, isLoading } = useContracts();
  const { data: financeByCid } = useAllFinance();
  const [search, setSearch] = useState("");
  const loaded = !isLoading;

  // Project Supabase contract rows into the display shape (excl. Cancelled).
  const contracts = useMemo(
    () =>
      (contractRows ?? [])
        .filter((c) => c.status !== "Cancelled")
        .map((c) => ({
          id: c.id,
          contractNo: c.contract_no,
          invoiceNo: c.invoice_no,
          buyer: c.master_snapshot?.buyer?.company?.trim() || "—",
          lineItems: c.master_snapshot?.lineItems ?? [],
          numberOfContainers: c.master_snapshot?.terms?.numberOfContainers,
        })),
    [contractRows]
  );

  const financeMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof calcSummary>> = {};
    for (const c of contracts) {
      const t = calcTotals(c.lineItems, c.numberOfContainers);
      const f = rowToFinance(financeByCid?.[c.id]);
      map[c.contractNo] = calcSummary(t.totalUSD, f);
    }
    return map;
  }, [contracts, financeByCid]);

  // Dashboard stats
  const stats = useMemo(() => {
    let totalRevenue = 0, totalCost = 0, totalProfit = 0, outstanding = 0, outstandingCount = 0;
    const buyerProfits: Record<string, number> = {};
    for (const c of contracts) {
      const s = financeMap[c.contractNo];
      if (!s) continue;
      totalRevenue += s.revenue;
      totalCost += s.totalCost;
      totalProfit += s.grossProfit;
      if (s.outstanding > 1) { outstanding += s.outstanding; outstandingCount++; }
      buyerProfits[c.buyer] = (buyerProfits[c.buyer] ?? 0) + s.grossProfit;
    }
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const topBuyer = Object.entries(buyerProfits).sort((a, b) => b[1] - a[1])[0];
    return { totalRevenue, totalCost, totalProfit, avgMargin, outstanding, outstandingCount, topBuyer };
  }, [contracts, financeMap]);

  const filtered = useMemo(() => {
    if (!search) return contracts;
    const q = search.toLowerCase();
    return contracts.filter((c) =>
      c.contractNo.toLowerCase().includes(q) || c.invoiceNo.toLowerCase().includes(q) || c.buyer.toLowerCase().includes(q)
    );
  }, [contracts, search]);

  if (!loaded) return <div className="flex items-center justify-center py-20 text-slate-500 font-medium">Loading finance...</div>;

  if (contracts.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-6 py-24 text-center rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 mt-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 shadow-sm">
          <Wallet className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">No Financial Data</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Submit a contract from Master Data to start tracking revenue and costs.
          </p>
        </div>
        <Link href="/master">
          <Button className="gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 shadow-md shadow-indigo-500/20">Go to Master Data</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-8">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Financial Overview</h2>
        <p className="text-slate-500 mt-1 text-sm font-medium">Track revenue, monitor profitability, and manage outstanding payments.</p>
      </div>

      {/* Dashboard stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total Revenue", value: fmtUSD(stats.totalRevenue), icon: DollarSign, color: "text-indigo-700 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/30", iconBg: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" },
          { label: "Total Profit", value: fmtUSD(stats.totalProfit), icon: TrendingUp, color: stats.totalProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400", bg: stats.totalProfit >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30" : "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/30", iconBg: stats.totalProfit >= 0 ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" : "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400" },
          { label: "Avg Margin", value: stats.avgMargin.toFixed(1) + "%", icon: TrendingUp, color: stats.avgMargin >= 15 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400", bg: "bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10", iconBg: "bg-slate-100 dark:bg-zinc-800 text-slate-500" },
          { label: "Outstanding", value: `${fmtUSD(stats.outstanding)}`, subtitle: `${stats.outstandingCount} invoices`, icon: Clock, color: stats.outstandingCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400", bg: stats.outstandingCount > 0 ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30" : "bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10", iconBg: stats.outstandingCount > 0 ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400" : "bg-slate-100 dark:bg-zinc-800 text-slate-500" },
          { label: "Top Buyer", value: stats.topBuyer ? `${stats.topBuyer[0]}` : "—", icon: Trophy, color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30", iconBg: "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border p-5 shadow-sm transition-all ${s.bg}`}>
            <div className="flex items-center gap-3 text-sm font-bold text-slate-600 dark:text-slate-400 mb-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.iconBg}`}><s.icon className="h-4 w-4" /></span>
              {s.label}
            </div>
            <p className={`text-2xl font-black tracking-tight ${s.color}`}>{s.value}</p>
            {s.subtitle && <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{s.subtitle}</p>}
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/60 dark:border-white/10 shadow-sm p-1.5">
        <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by contract, invoice, or buyer..." className="pl-10 h-11 bg-transparent border-0 focus-visible:ring-0 shadow-none font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400" />
      </div>

      {/* Table */}
      <Card className="bg-white/70 dark:bg-zinc-900/70 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 hover:bg-transparent">
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">Contract</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">Buyer</TableHead>
                <TableHead className="text-right font-bold text-slate-700 dark:text-slate-300 py-4">Revenue</TableHead>
                <TableHead className="text-right font-bold text-slate-700 dark:text-slate-300 py-4">Cost</TableHead>
                <TableHead className="text-right font-bold text-slate-700 dark:text-slate-300 py-4">Profit</TableHead>
                <TableHead className="text-right font-bold text-slate-700 dark:text-slate-300 py-4">Margin</TableHead>
                <TableHead className="text-right font-bold text-slate-700 dark:text-slate-300 py-4">Received</TableHead>
                <TableHead className="py-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const s = financeMap[c.contractNo];
                const hasCosts = s && s.totalCost > 0;
                return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 transition-colors">
                    <TableCell className="py-4">
                      <Link href={`/finance/${encodeURIComponent(c.contractNo)}`} className="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-md border border-indigo-100 dark:border-indigo-800/30 whitespace-nowrap">
                        {c.contractNo}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium text-slate-700 dark:text-slate-300">{c.buyer}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-slate-800 dark:text-slate-200">{fmtUSD(s.revenue)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-slate-600 dark:text-slate-400">{hasCosts ? fmtUSD(s.totalCost) : "—"}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${hasCosts ? (s.grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400") : "text-slate-400"}`}>
                      {hasCosts ? fmtUSD(s.grossProfit) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-600 dark:text-slate-400">{hasCosts ? s.margin.toFixed(1) + "%" : "—"}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-slate-800 dark:text-slate-200">{s.totalReceived > 0 ? fmtUSD(s.totalReceived) : "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${STATUS_BADGE[s.paymentStatus]}`}>
                        {STATUS_LABEL[s.paymentStatus]}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Totals row */}
              <TableRow className="bg-indigo-50/50 dark:bg-indigo-900/10 font-black border-t-2 border-indigo-100 dark:border-indigo-800/30">
                <TableCell colSpan={2} className="py-4 text-indigo-900 dark:text-indigo-200">TOTAL PORTFOLIO</TableCell>
                <TableCell className="text-right font-mono text-indigo-700 dark:text-indigo-400">{fmtUSD(stats.totalRevenue)}</TableCell>
                <TableCell className="text-right font-mono text-indigo-700 dark:text-indigo-400">{fmtUSD(stats.totalCost)}</TableCell>
                <TableCell className={`text-right font-mono ${stats.totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{fmtUSD(stats.totalProfit)}</TableCell>
                <TableCell className="text-right text-indigo-700 dark:text-indigo-400">{stats.avgMargin.toFixed(1)}%</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
