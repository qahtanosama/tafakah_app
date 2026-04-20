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
import { Search, Ship, Calendar, Anchor, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import type { ContractLogEntry } from "@/types/sales-contract";
import type { ShippingEntry, ShippingStatus } from "@/types/shipping";
import { getContractLog } from "@/lib/contract-log";
import { getAllShipping, getStatusInfo, resolveStatus, saveShipping, ensureShippingFields } from "@/lib/shipping";
import { getShipsgoToken } from "@/lib/settings";
import { fetchShipmentFromShipsgo, mergeTrackIntoEntry, getUsage, usageRemaining } from "@/lib/shipsgo";

type SortKey = "eta" | "etd" | "contract";
type StatusFilter = "all" | ShippingStatus;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
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

  // Dashboard stats
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
    setBulkResult((prev) => prev ?? `Refreshed ${ok} \u00b7 failed ${fail}`);
    setTimeout(() => setBulkResult(null), 5000);
  }, [trackableEntries]);

  const cancelBulk = useCallback(() => {
    cancelBulkRef.current = true;
  }, []);

  if (!loaded) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;

  if (contracts.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-lg font-medium text-zinc-500">No contracts yet</p>
        <p className="mt-2 text-sm text-zinc-400">Submit a contract from <Link href="/master" className="text-emerald-600 underline">Master Data</Link> to start tracking shipments.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      {/* Dashboard stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Ship className="h-4 w-4" />}
          label="Currently at Sea"
          value={`${stats.atSeaCount} container${stats.atSeaCount === 1 ? "" : "s"}`}
          color="text-blue-600"
        />
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          label="Next Departure"
          value={stats.nextDep
            ? `${stats.nextDep.r.contract.contractNo.split("-")[1] ?? stats.nextDep.r.contract.contractNo} \u00b7 ${stats.nextDep.d === 0 ? "today" : stats.nextDep.d === 1 ? "tomorrow" : `in ${stats.nextDep.d} days`}`
            : "\u2014"}
          subtitle={stats.nextDep ? fmtDate(stats.nextDep.r.entry?.atd ?? stats.nextDep.r.entry?.etd) : ""}
          color="text-amber-600"
        />
        <StatCard
          icon={<Anchor className="h-4 w-4" />}
          label="Next Arrival"
          value={stats.nextArr
            ? `${stats.nextArr.r.contract.contractNo.split("-")[1] ?? stats.nextArr.r.contract.contractNo} \u00b7 ${stats.nextArr.d === 0 ? "today" : stats.nextArr.d === 1 ? "tomorrow" : `in ${stats.nextArr.d} days`}`
            : "\u2014"}
          subtitle={stats.nextArr ? fmtDate(stats.nextArr.r.entry?.ata ?? stats.nextArr.r.entry?.eta) : ""}
          color="text-emerald-600"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Delayed"
          value={`${stats.delayedCount} shipment${stats.delayedCount === 1 ? "" : "s"}`}
          subtitle={stats.mostOverdue
            ? `${stats.mostOverdue.r.contract.contractNo.split("-")[1] ?? ""} \u2014 ${Math.abs(stats.mostOverdue.d)} days overdue`
            : ""}
          color={stats.delayedCount > 0 ? "text-red-600" : "text-zinc-500"}
          emphasized={stats.delayedCount > 0}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by contract, vessel, or buyer..." className="pl-9" />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!!bulkState || trackableEntries.length === 0}
          onClick={handleBulkRefresh}
          title={!hasToken ? "Configure Shipsgo API in Settings" : `Refresh ${trackableEntries.length} shipment${trackableEntries.length === 1 ? "" : "s"}`}
          className="gap-1"
        >
          {bulkState ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh All
          {hasToken && trackableEntries.length > 0 && <span className="text-xs text-zinc-400">({trackableEntries.length})</span>}
        </Button>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
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
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="eta">Sort: ETA (nearest first)</SelectItem>
            <SelectItem value="etd">Sort: ETD</SelectItem>
            <SelectItem value="contract">Sort: Contract No</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Status totals */}
      <p className="text-xs text-zinc-500">
        {counts.at_sea} at sea &middot; {counts.pending} pending &middot; {counts.delivered} delivered &middot; {counts.delayed} delayed &middot; {counts.not_scheduled} not scheduled
      </p>

      {/* Bulk progress */}
      {bulkState && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Updating {bulkState.index} of {bulkState.total} &mdash; <span className="font-mono">{bulkState.current}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={cancelBulk}>Cancel</Button>
        </div>
      )}
      {bulkResult && !bulkState && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {bulkResult}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contract</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Vessel</TableHead>
              <TableHead>ETD</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(({ contract, entry, info }) => {
              const snap = contract.masterSnapshot;
              return (
                <TableRow key={contract.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  <TableCell>
                    <Link href={`/shipping/${encodeURIComponent(contract.contractNo)}`} className="font-mono font-medium text-emerald-600 hover:underline">
                      {contract.contractNo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{contract.buyer}</TableCell>
                  <TableCell className="text-sm">{snap.shipping.loadingPort} &rarr; {snap.shipping.dischargePort}</TableCell>
                  <TableCell className="text-sm">
                    {entry?.vesselName ? (
                      <span>
                        <span className="font-medium">{entry.vesselName}</span>
                        {entry.voyageNumber && <span className="text-zinc-400"> / {entry.voyageNumber}</span>}
                      </span>
                    ) : <span className="text-zinc-300">&mdash;</span>}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(entry?.atd ?? entry?.etd)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(entry?.ata ?? entry?.eta)}</TableCell>
                  <TableCell className="text-sm">{info.daysLabel}</TableCell>
                  <TableCell>
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${info.badgeColor}`}>
                      {info.icon} {info.label}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-zinc-400">
                  No shipments match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subtitle, color, emphasized }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
  emphasized?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-900 ${emphasized ? "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-zinc-400">{icon}{label}</div>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
    </div>
  );
}
