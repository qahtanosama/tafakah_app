"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Ship, Calendar, Anchor, AlertTriangle, RefreshCw, Loader2, Navigation } from "lucide-react";
import type { ContractLogEntry } from "@/types/sales-contract";
import type { ShippingEntry, ShippingStatus } from "@/types/shipping";
import { getContractLog } from "@/lib/contract-log";
import { getAllShipping, getStatusInfo, resolveStatus, saveShipping, ensureShippingFields } from "@/lib/shipping";
import { getShipsgoToken } from "@/lib/settings";
import { fetchShipmentFromShipsgo, mergeTrackIntoEntry, getUsage, usageRemaining } from "@/lib/shipsgo";
import { Card, CardContent } from "@/components/ui/card";

type SortKey = "eta" | "etd" | "contract";
type StatusFilter = "all" | ShippingStatus;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ShippingOverview() {
  const [contracts, setContracts] = useState<ContractLogEntry[]>([]);
  const [entries, setEntries] = useState<ShippingEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("eta");
  const [hasToken, setHasToken] = useState(false);
  const [bulkState, setBulkState] = useState<{ running: boolean; index: number; total: number; current: string } | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const cancelBulkRef = useRef(false);

  useEffect(() => {
    setContracts(getContractLog());
    setEntries(getAllShipping());
    setHasToken(!!getShipsgoToken());
    setLoaded(true);
  }, []);

  const rows = useMemo(() => {
    return contracts.map((c) => {
      const entry = entries.find((e) => e.contractNo === c.contractNo) ?? null;
      const info = getStatusInfo(entry);
      const status = resolveStatus(entry);
      return {
        contract: c,
        entry,
        status,
        info,
      };
    });
  }, [contracts, entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows;
    if (q) {
      r = r.filter((row) =>
        row.contract.contractNo.toLowerCase().includes(q) ||
        row.contract.buyer.toLowerCase().includes(q) ||
        (row.entry?.vesselName ?? "").toLowerCase().includes(q) ||
        (row.entry?.voyageNumber ?? "").toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      r = r.filter((row) => row.status === statusFilter);
    }
    const sorted = [...r];
    sorted.sort((a, b) => {
      if (sortKey === "contract") return a.contract.contractNo.localeCompare(b.contract.contractNo);
      const ak = sortKey === "eta"
        ? (a.entry?.ata ?? a.entry?.eta ?? "")
        : (a.entry?.atd ?? a.entry?.etd ?? "");
      const bk = sortKey === "eta"
        ? (b.entry?.ata ?? b.entry?.eta ?? "")
        : (b.entry?.atd ?? b.entry?.etd ?? "");
      if (!ak && !bk) return 0;
      if (!ak) return 1;
      if (!bk) return -1;
      return ak.localeCompare(bk);
    });
    return sorted;
  }, [rows, search, statusFilter, sortKey]);

  const counts = useMemo(() => {
    const c = { at_sea: 0, pending: 0, delivered: 0, delayed: 0, not_scheduled: 0, cancelled: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const stats = useMemo(() => {
    const atSea = rows.filter((r) => r.status === "at_sea");
    const pending = rows.filter((r) => r.status === "pending" && r.entry?.etd);
    const atSeaArrivals = rows.filter((r) => (r.status === "at_sea" || r.status === "pending") && (r.entry?.ata || r.entry?.eta));
    const delayed = rows.filter((r) => r.status === "delayed");

    const nextDep = pending
      .map((r) => ({ r, d: daysFromToday(r.entry?.atd ?? r.entry?.etd) }))
      .filter((x): x is { r: typeof pending[0]; d: number } => x.d !== null && x.d >= 0)
      .sort((a, b) => a.d - b.d)[0];

    const nextArr = atSeaArrivals
      .map((r) => ({ r, d: daysFromToday(r.entry?.ata ?? r.entry?.eta) }))
      .filter((x): x is { r: typeof atSeaArrivals[0]; d: number } => x.d !== null && x.d >= 0)
      .sort((a, b) => a.d - b.d)[0];

    const mostOverdue = delayed
      .map((r) => ({ r, d: daysFromToday(r.entry?.ata ?? r.entry?.eta) }))
      .filter((x): x is { r: typeof delayed[0]; d: number } => x.d !== null)
      .sort((a, b) => a.d - b.d)[0];

    return { atSeaCount: atSea.length, nextDep, nextArr, delayedCount: delayed.length, mostOverdue };
  }, [rows]);

  const trackableEntries = useMemo(
    () => entries.filter((e) => (e.blNumber || e.containerNumber)),
    [entries]
  );

  const handleBulkRefresh = useCallback(async () => {
    const token = getShipsgoToken();
    if (!token) {
      alert("Configure Shipsgo API in Settings first.");
      return;
    }
    if (trackableEntries.length === 0) {
      alert("No shipments with a B/L or container number to refresh.");
      return;
    }
    const u = getUsage();
    const remaining = usageRemaining();
    if (remaining < trackableEntries.length) {
      const ok = confirm(
        `This will use ${trackableEntries.length} requests. You have ${remaining} remaining this month (${u.count}/${u.limit}). Continue anyway?`
      );
      if (!ok) return;
    } else if (trackableEntries.length >= 5) {
      const ok = confirm(
        `This will use ${trackableEntries.length} requests. You have ${remaining} remaining this month. Continue?`
      );
      if (!ok) return;
    }

    cancelBulkRef.current = false;
    setBulkResult(null);
    let ok = 0, fail = 0;
    for (let i = 0; i < trackableEntries.length; i++) {
      if (cancelBulkRef.current) break;
      const target = ensureShippingFields(trackableEntries[i]);
      setBulkState({ running: true, index: i + 1, total: trackableEntries.length, current: target.contractNo });

      const result = await fetchShipmentFromShipsgo(target, token);
      if (result.success && result.data) {
        const { next } = mergeTrackIntoEntry(target, result.data);
        saveShipping(next);
        setEntries((prev) => prev.map((e) => (e.contractNo === next.contractNo ? next : e)));
        ok++;
      } else {
        fail++;
        if (result.errorCode === "quota" || result.errorCode === "auth") {
          setBulkResult(`Stopped: ${result.error}`);
          break;
        }
      }
      if (i < trackableEntries.length - 1 && !cancelBulkRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    setBulkState(null);
    setBulkResult((prev) => prev ?? `Refreshed ${ok} · failed ${fail}`);
    setTimeout(() => setBulkResult(null), 5000);
  }, [trackableEntries]);

  const cancelBulk = useCallback(() => {
    cancelBulkRef.current = true;
  }, []);

  if (!loaded) return <div className="flex items-center justify-center py-20 text-slate-500 font-medium">Loading logistics...</div>;

  if (contracts.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-6 py-24 text-center rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 mt-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 shadow-sm">
          <Navigation className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">No Contracts Found</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Submit a contract from Master Data to start tracking shipments.
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
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Logistics & Tracking</h2>
        <p className="text-slate-500 mt-1 text-sm font-medium">Monitor active shipments, track vessels, and manage ETA schedules.</p>
      </div>

      {/* Dashboard stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Ship className="h-4 w-4" />}
          label="Currently at Sea"
          value={`${stats.atSeaCount} container${stats.atSeaCount === 1 ? "" : "s"}`}
          color="text-indigo-600 dark:text-indigo-400"
          bg="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/30"
          iconBg="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
        />
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          label="Next Departure"
          value={stats.nextDep
            ? `${stats.nextDep.r.contract.contractNo.split("-")[1] ?? stats.nextDep.r.contract.contractNo} · ${stats.nextDep.d === 0 ? "today" : stats.nextDep.d === 1 ? "tomorrow" : `in ${stats.nextDep.d} days`}`
            : "—"}
          subtitle={stats.nextDep ? fmtDate(stats.nextDep.r.entry?.atd ?? stats.nextDep.r.entry?.etd) : ""}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/30"
          iconBg="bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
        />
        <StatCard
          icon={<Anchor className="h-4 w-4" />}
          label="Next Arrival"
          value={stats.nextArr
            ? `${stats.nextArr.r.contract.contractNo.split("-")[1] ?? stats.nextArr.r.contract.contractNo} · ${stats.nextArr.d === 0 ? "today" : stats.nextArr.d === 1 ? "tomorrow" : `in ${stats.nextArr.d} days`}`
            : "—"}
          subtitle={stats.nextArr ? fmtDate(stats.nextArr.r.entry?.ata ?? stats.nextArr.r.entry?.eta) : ""}
          color="text-emerald-600 dark:text-emerald-400"
          bg="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30"
          iconBg="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Delayed"
          value={`${stats.delayedCount} shipment${stats.delayedCount === 1 ? "" : "s"}`}
          subtitle={stats.mostOverdue
            ? `${stats.mostOverdue.r.contract.contractNo.split("-")[1] ?? ""} — ${Math.abs(stats.mostOverdue.d)} days overdue`
            : ""}
          color={stats.delayedCount > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500"}
          bg={stats.delayedCount > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30" : "bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10"}
          iconBg={stats.delayedCount > 0 ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400" : "bg-slate-100 dark:bg-zinc-800 text-slate-500"}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-slate-200/60 dark:border-white/10 shadow-sm">
        <div className="relative min-w-[240px] flex-1 sm:max-w-md">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by contract, vessel, or buyer..." className="pl-9 h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
        </div>
        <Button
          variant="outline"
          disabled={!!bulkState || trackableEntries.length === 0}
          onClick={handleBulkRefresh}
          title={!hasToken ? "Configure Shipsgo API in Settings" : `Refresh ${trackableEntries.length} shipment${trackableEntries.length === 1 ? "" : "s"}`}
          className="gap-2 h-11 border-slate-200 dark:border-white/10 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
        >
          {bulkState ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh All
          {hasToken && trackableEntries.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-xs text-indigo-700 dark:text-indigo-300">{trackableEntries.length}</span>}
        </Button>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px] h-11 font-medium bg-white dark:bg-zinc-800 border-slate-200 dark:border-white/10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="at_sea">At Sea</SelectItem>
            <SelectItem value="pending">Pending Departure</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="delayed">Delayed</SelectItem>
            <SelectItem value="not_scheduled">Not Scheduled</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => v && setSortKey(v as SortKey)}>
          <SelectTrigger className="w-[200px] h-11 font-medium bg-white dark:bg-zinc-800 border-slate-200 dark:border-white/10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="eta">Sort: ETA (nearest first)</SelectItem>
            <SelectItem value="etd">Sort: ETD</SelectItem>
            <SelectItem value="contract">Sort: Contract No</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Status totals */}
      <div className="flex gap-4 items-center text-xs font-bold text-slate-500 uppercase tracking-wider px-2">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500"></span> {counts.at_sea} at sea</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500"></span> {counts.pending} pending</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"></span> {counts.delivered} delivered</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500"></span> {counts.delayed} delayed</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300"></span> {counts.not_scheduled} unscheduled</span>
      </div>

      {/* Bulk progress */}
      {bulkState && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 backdrop-blur px-6 py-4 text-sm font-semibold text-blue-800 shadow-sm animate-in fade-in slide-in-from-top-2">
          <span className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            Updating {bulkState.index} of {bulkState.total} — <span className="font-mono bg-blue-100 px-2 py-0.5 rounded text-blue-900">{bulkState.current}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={cancelBulk} className="text-blue-700 hover:bg-blue-100 font-bold">Cancel</Button>
        </div>
      )}
      {bulkResult && !bulkState && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 backdrop-blur px-6 py-4 text-sm font-bold text-emerald-800 shadow-sm animate-in fade-in slide-in-from-top-2">
          {bulkResult}
        </div>
      )}

      {/* Table */}
      <Card className="bg-white/70 dark:bg-zinc-900/70 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 hover:bg-transparent">
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">Contract</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">Buyer</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">Route</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">Vessel</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">ETD</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">ETA</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">Days</TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(({ contract, entry, info }) => {
                const snap = contract.masterSnapshot;
                return (
                  <TableRow key={contract.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <TableCell className="py-4">
                      <Link href={`/shipping/${encodeURIComponent(contract.contractNo)}`} className="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-md border border-indigo-100 dark:border-indigo-800/30 whitespace-nowrap">
                        {contract.contractNo}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium text-slate-700 dark:text-slate-300">{contract.buyer}</TableCell>
                    <TableCell className="text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[100px]">{snap.shipping.loadingPort}</span>
                        <span className="text-slate-300 dark:text-slate-600">→</span>
                        <span className="truncate max-w-[100px]">{snap.shipping.dischargePort}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry?.vesselName ? (
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{entry.vesselName}</span>
                          {entry.voyageNumber && <span className="font-mono text-xs text-slate-500 mt-0.5">{entry.voyageNumber}</span>}
                        </div>
                      ) : <span className="text-slate-400 italic font-medium">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-slate-700 dark:text-slate-300">{fmtDate(entry?.atd ?? entry?.etd)}</TableCell>
                    <TableCell className="text-sm font-medium text-slate-700 dark:text-slate-300">{fmtDate(entry?.ata ?? entry?.eta)}</TableCell>
                    <TableCell className="text-sm font-bold text-slate-500 dark:text-slate-400">{info.daysLabel}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${info.badgeColor}`}>
                        {info.icon} {info.label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-20 text-center">
                    <p className="text-sm font-bold text-slate-500">No shipments match the current filters.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, subtitle, color, bg, iconBg }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
  bg: string;
  iconBg: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm transition-all ${bg}`}>
      <div className="flex items-center gap-3 text-sm font-bold text-slate-600 dark:text-slate-400 mb-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>{icon}</span>
        {label}
      </div>
      <p className={`text-2xl font-black tracking-tight ${color}`}>{value}</p>
      {subtitle && <p className="mt-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
  );
}
