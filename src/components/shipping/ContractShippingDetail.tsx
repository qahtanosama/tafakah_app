"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ExternalLink, Ship, Check } from "lucide-react";
import type { ContractLogEntry } from "@/types/sales-contract";
import type { ShippingEntry, ShippingLine, ShippingStatusOverride } from "@/types/shipping";
import { SHIPPING_LINES } from "@/types/shipping";
import { getContractLog } from "@/lib/contract-log";
import {
  getShipping, saveShipping, createEmptyShipping,
  getStatusInfo, calcTransitProgress, getTrackingLinks, calcAutoStatus,
} from "@/lib/shipping";
import { calcTotals } from "@/lib/sales-contract";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Timeline ─────────────────────────────────────────── */
interface Milestone {
  key: string;
  label: string;
  date: string | null;
  state: "done" | "current" | "future" | "missed";
}

function buildMilestones(entry: ShippingEntry): Milestone[] {
  const todayISO = new Date().toISOString().split("T")[0];
  const autoStatus = calcAutoStatus(entry);

  const booked = entry.updatedAt ? entry.updatedAt.split("T")[0] : null;

  function stateFor(date: string | null, opts: { currentIf?: boolean; missedIf?: boolean } = {}): "done" | "current" | "future" | "missed" {
    if (opts.missedIf) return "missed";
    if (opts.currentIf) return "current";
    if (!date) return "future";
    return date <= todayISO ? "done" : "future";
  }

  const effectiveEtd = entry.atd ?? entry.etd;
  const effectiveEta = entry.ata ?? entry.eta;

  return [
    { key: "booked", label: "Booked", date: booked, state: "done" },
    { key: "cutoff", label: "Cut-off", date: entry.cutoffDate || null, state: stateFor(entry.cutoffDate) },
    { key: "loaded", label: "Loaded", date: entry.loadingDate || null, state: stateFor(entry.loadingDate) },
    { key: "etd", label: entry.atd ? "Departed" : "ETD", date: effectiveEtd || null, state: stateFor(effectiveEtd, { currentIf: autoStatus === "pending" }) },
    { key: "atsea", label: "At Sea", date: null, state: autoStatus === "at_sea" ? "current" : (entry.atd && entry.ata ? "done" : (entry.atd ? "done" : "future")) },
    { key: "eta", label: entry.ata ? "Arrived" : "ETA", date: effectiveEta || null, state: autoStatus === "delayed" && !entry.ata ? "missed" : stateFor(effectiveEta, { currentIf: false }) },
    { key: "delivered", label: "Delivered", date: entry.ata || null, state: entry.ata ? "done" : (autoStatus === "delayed" ? "missed" : "future") },
  ];
}

function MilestoneDot({ m }: { m: Milestone }) {
  const color =
    m.state === "done" ? "bg-emerald-500 text-white" :
    m.state === "current" ? "bg-amber-400 text-white ring-4 ring-amber-100" :
    m.state === "missed" ? "bg-red-500 text-white" :
    "bg-zinc-200 text-zinc-400";
  const symbol =
    m.state === "done" ? "\u2713" :
    m.state === "current" ? "\u25cf" :
    m.state === "missed" ? "\u00d7" :
    "\u00b7";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${color}`}>{symbol}</div>
      <div className="text-center text-xs">
        <div className="font-medium text-zinc-700 dark:text-zinc-300">{m.label}</div>
        <div className="text-zinc-400">{m.date ? fmtDate(m.date) : "\u2014"}</div>
      </div>
    </div>
  );
}

function Timeline({ entry }: { entry: ShippingEntry }) {
  const milestones = buildMilestones(entry);
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[640px] items-start justify-between gap-2 py-2">
        {milestones.map((m, i) => (
          <div key={m.key} className="flex flex-1 items-start">
            <MilestoneDot m={m} />
            {i < milestones.length - 1 && (
              <div className={`mt-4 h-0.5 flex-1 ${
                milestones[i].state === "done" ? "bg-emerald-500" :
                milestones[i].state === "missed" ? "bg-red-300" :
                "bg-zinc-200"
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Transit progress bar ─────────────────────────────── */
function TransitProgress({ entry }: { entry: ShippingEntry }) {
  const status = calcAutoStatus(entry);
  if (status !== "at_sea" && status !== "delayed") return null;
  const progress = calcTransitProgress(entry);
  const pct = Math.min(100, Math.max(0, progress * 100));
  const depLabel = entry.atd ? `ATD ${fmtDate(entry.atd)}` : `ETD ${fmtDate(entry.etd)}`;
  const arrLabel = entry.ata ? `ATA ${fmtDate(entry.ata)}` : `ETA ${fmtDate(entry.eta)}`;
  const info = getStatusInfo(entry);

  return (
    <div className="rounded-lg border bg-white p-5 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{depLabel}</span>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{arrLabel}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${status === "delayed" ? "bg-red-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
          style={{ left: `${pct}%` }}
        >
          <Ship className={`h-5 w-5 ${status === "delayed" ? "text-red-600" : "text-blue-600"}`} />
        </div>
      </div>
      <p className={`mt-3 text-center text-sm font-medium ${status === "delayed" ? "text-red-600" : "text-blue-600"}`}>
        {info.daysLabel}
      </p>
    </div>
  );
}

/* ── Main component ───────────────────────────────────── */
export default function ContractShippingDetail({ contractNo }: { contractNo: string }) {
  const [contract, setContract] = useState<ContractLogEntry | null>(null);
  const [entry, setEntry] = useState<ShippingEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const log = getContractLog();
    const c = log.find((e) => e.contractNo === contractNo) ?? null;
    setContract(c);
    let e = getShipping(contractNo);
    if (!e) {
      e = createEmptyShipping(contractNo, {
        blNumber: c?.masterSnapshot.identifiers.blNumber ?? "",
        containerNumber: c?.masterSnapshot.identifiers.containerNumber ?? "",
        sealNumber: c?.masterSnapshot.identifiers.sealNumber ?? "",
      });
    }
    setEntry(e);
    setLoaded(true);
  }, [contractNo]);

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    if (savedTimeout.current) clearTimeout(savedTimeout.current);
    savedTimeout.current = setTimeout(() => setSavedFlash(false), 1200);
  }, []);

  const persist = useCallback((next: ShippingEntry) => {
    saveShipping(next);
    setEntry({ ...next });
    flashSaved();
  }, [flashSaved]);

  const update = useCallback(<K extends keyof ShippingEntry>(key: K, value: ShippingEntry[K]) => {
    setEntry((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const commit = useCallback(() => {
    if (entry) persist(entry);
  }, [entry, persist]);

  const totals = useMemo(() => contract ? calcTotals(contract.masterSnapshot.lineItems) : null, [contract]);

  if (!loaded) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;
  if (!contract) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-zinc-500">Contract &ldquo;{contractNo}&rdquo; not found.</p>
        <Link href="/shipping" className="mt-4 inline-block text-emerald-600 underline">Back to Shipping</Link>
      </div>
    );
  }
  if (!entry) return null;

  const snap = contract.masterSnapshot;
  const statusInfo = getStatusInfo(entry);
  const trackingLinks = getTrackingLinks(entry);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link href="/shipping" className="text-zinc-400 hover:text-zinc-600"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold font-mono">{contractNo}</h1>
            <p className="text-base text-zinc-500">
              {snap.buyer.company} &middot; {snap.shipping.loadingPort} &rarr; {snap.shipping.dischargePort}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-sm font-medium ${statusInfo.badgeColor}`}>
            {statusInfo.icon} {statusInfo.label}
          </span>
          {savedFlash && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" /> Saved</span>}
        </div>
      </div>

      {/* Contract summary */}
      <div className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-4 dark:bg-zinc-900">
        <div><p className="text-xs text-zinc-400">Buyer</p><p className="text-sm font-medium">{snap.buyer.company}</p></div>
        <div><p className="text-xs text-zinc-400">Container Type</p><p className="text-sm font-medium">{snap.terms.containerType || "\u2014"}</p></div>
        <div><p className="text-xs text-zinc-400">Quantity</p><p className="text-sm font-medium">{totals ? `${totals.totalQtyMTS} MT \u00b7 ${totals.totalCartons} ctns` : "\u2014"}</p></div>
        <div><p className="text-xs text-zinc-400">Days</p><p className="text-sm font-medium">{statusInfo.daysLabel}</p></div>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
        <CardContent><Timeline entry={entry} /></CardContent>
      </Card>

      {/* Transit progress */}
      <TransitProgress entry={entry} />

      {/* External tracking links */}
      {trackingLinks.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Track Vessel</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {trackingLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {link.name}
                </a>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-400">Links open in a new tab. MSC requires manual lookup on their site.</p>
          </CardContent>
        </Card>
      )}

      {/* Booking */}
      <Card>
        <CardHeader><CardTitle className="text-base">Booking</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Shipping Line</Label>
            <Select value={entry.shippingLine || undefined} onValueChange={(v) => { update("shippingLine", (v ?? "") as ShippingLine); setTimeout(commit, 0); }}>
              <SelectTrigger><SelectValue placeholder="Select shipping line" /></SelectTrigger>
              <SelectContent>
                {SHIPPING_LINES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Booking Reference</Label>
            <Input value={entry.bookingRef} onChange={(e) => update("bookingRef", e.target.value)} onBlur={commit} placeholder="BK123456" />
          </div>
          <div>
            <Label>Vessel Name</Label>
            <Input value={entry.vesselName} onChange={(e) => update("vesselName", e.target.value)} onBlur={commit} placeholder="MSC OSCAR" />
          </div>
          <div>
            <Label>Voyage Number</Label>
            <Input value={entry.voyageNumber} onChange={(e) => update("voyageNumber", e.target.value)} onBlur={commit} placeholder="V.123W" />
          </div>
          <div className="sm:col-span-2">
            <Label>B/L Number</Label>
            <Input value={entry.blNumber} onChange={(e) => update("blNumber", e.target.value)} onBlur={commit} placeholder="Bill of Lading number" />
          </div>
        </CardContent>
      </Card>

      {/* Dates */}
      <Card>
        <CardHeader><CardTitle className="text-base">Dates</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div><Label>Cut-off Date</Label><Input type="date" value={entry.cutoffDate} onChange={(e) => update("cutoffDate", e.target.value)} onBlur={commit} /></div>
          <div><Label>Loading Date</Label><Input type="date" value={entry.loadingDate} onChange={(e) => update("loadingDate", e.target.value)} onBlur={commit} /></div>
          <div><Label>ETD (Estimated)</Label><Input type="date" value={entry.etd} onChange={(e) => update("etd", e.target.value)} onBlur={commit} /></div>
          <div><Label>ATD (Actual)</Label><Input type="date" value={entry.atd ?? ""} onChange={(e) => update("atd", e.target.value || null)} onBlur={commit} /></div>
          <div><Label>ETA (Estimated)</Label><Input type="date" value={entry.eta} onChange={(e) => update("eta", e.target.value)} onBlur={commit} /></div>
          <div><Label>ATA (Actual)</Label><Input type="date" value={entry.ata ?? ""} onChange={(e) => update("ata", e.target.value || null)} onBlur={commit} /></div>
        </CardContent>
      </Card>

      {/* Container */}
      <Card>
        <CardHeader><CardTitle className="text-base">Container</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><Label>Container Number</Label><Input value={entry.containerNumber} onChange={(e) => update("containerNumber", e.target.value)} onBlur={commit} /></div>
          <div><Label>Seal Number</Label><Input value={entry.sealNumber} onChange={(e) => update("sealNumber", e.target.value)} onBlur={commit} /></div>
        </CardContent>
      </Card>

      {/* Status & notes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Status & Notes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Status Override</Label>
            <Select
              value={entry.statusOverride}
              onValueChange={(v) => { if (!v) return; update("statusOverride", v as ShippingStatusOverride); setTimeout(commit, 0); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (calculated from dates)</SelectItem>
                <SelectItem value="pending">Pending Departure</SelectItem>
                <SelectItem value="at_sea">At Sea</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="delayed">Delayed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <textarea
              value={entry.notes}
              onChange={(e) => update("notes", e.target.value)}
              onBlur={commit}
              rows={3}
              placeholder="e.g. Delayed due to typhoon warning"
              className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={commit} className="gap-1"><Check className="h-4 w-4" /> Save</Button>
      </div>
    </div>
  );
}
