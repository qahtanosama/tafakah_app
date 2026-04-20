"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, DollarSign, TrendingUp, Clock, Trophy } from "lucide-react";
import type { ContractLogEntry } from "@/types/sales-contract";
import { getContractLog } from "@/lib/contract-log";
import { calcTotals } from "@/lib/sales-contract";
import { getAllFinance, calcSummary } from "@/lib/finance";

function fmtUSD(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  unpaid: "bg-zinc-100 text-zinc-500",
  overpaid: "bg-blue-100 text-blue-700",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid", partial: "Partial", unpaid: "Pending", overpaid: "Overpaid",
};

export default function FinanceOverview() {
  const [contracts, setContracts] = useState<ContractLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setContracts(getContractLog());
    setLoaded(true);
  }, []);

  const financeMap = useMemo(() => {
    const all = getAllFinance();
    const map: Record<string, ReturnType<typeof calcSummary>> = {};
    for (const c of contracts) {
      const t = calcTotals(c.masterSnapshot.lineItems);
      const f = all.find((fi) => fi.contractNo === c.contractNo) ?? null;
      map[c.contractNo] = calcSummary(t.totalUSD, f);
    }
    return map;
  }, [contracts]);

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

  if (!loaded) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      {/* Dashboard stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total Revenue", value: fmtUSD(stats.totalRevenue), icon: DollarSign, color: "text-zinc-700" },
          { label: "Total Profit", value: fmtUSD(stats.totalProfit), icon: TrendingUp, color: stats.totalProfit >= 0 ? "text-emerald-600" : "text-red-600" },
          { label: "Avg Margin", value: stats.avgMargin.toFixed(1) + "%", icon: TrendingUp, color: stats.avgMargin >= 15 ? "text-emerald-600" : "text-amber-600" },
          { label: "Outstanding", value: `${fmtUSD(stats.outstanding)} (${stats.outstandingCount})`, icon: Clock, color: stats.outstandingCount > 0 ? "text-amber-600" : "text-emerald-600" },
          { label: "Top Buyer", value: stats.topBuyer ? `${stats.topBuyer[0]}` : "\u2014", icon: Trophy, color: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-900">
            <div className="flex items-center gap-2 text-xs text-zinc-400"><s.icon className="h-4 w-4" />{s.label}</div>
            <p className={`mt-1 text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by contract, invoice, or buyer..." className="pl-9" />
      </div>

      {/* Table */}
      {contracts.length === 0 ? (
        <p className="py-16 text-center text-base text-zinc-400">No contracts yet. Submit one from <Link href="/master" className="text-emerald-600 underline">Master Data</Link>.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const s = financeMap[c.contractNo];
                const hasCosts = s && s.totalCost > 0;
                return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <TableCell>
                      <Link href={`/finance/${encodeURIComponent(c.contractNo)}`} className="font-mono font-medium text-emerald-600 hover:underline">
                        {c.contractNo}
                      </Link>
                    </TableCell>
                    <TableCell>{c.buyer}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(s.revenue)}</TableCell>
                    <TableCell className="text-right font-mono">{hasCosts ? fmtUSD(s.totalCost) : "\u2014"}</TableCell>
                    <TableCell className={`text-right font-mono ${hasCosts ? (s.grossProfit >= 0 ? "text-emerald-600" : "text-red-600") : "text-zinc-400"}`}>
                      {hasCosts ? fmtUSD(s.grossProfit) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">{hasCosts ? s.margin.toFixed(1) + "%" : "\u2014"}</TableCell>
                    <TableCell className="text-right font-mono">{s.totalReceived > 0 ? fmtUSD(s.totalReceived) : "\u2014"}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.paymentStatus]}`}>
                        {STATUS_LABEL[s.paymentStatus]}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Totals row */}
              <TableRow className="bg-zinc-50 font-bold dark:bg-zinc-800">
                <TableCell colSpan={2}>TOTAL</TableCell>
                <TableCell className="text-right font-mono">{fmtUSD(stats.totalRevenue)}</TableCell>
                <TableCell className="text-right font-mono">{fmtUSD(stats.totalCost)}</TableCell>
                <TableCell className={`text-right font-mono ${stats.totalProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtUSD(stats.totalProfit)}</TableCell>
                <TableCell className="text-right">{stats.avgMargin.toFixed(1)}%</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
