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
import { ArrowLeft, ExternalLink, Ship, Check, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import type { ContractLogEntry } from "@/types/sales-contract";
import type { ShippingEntry, ShippingLine, ShippingStatusOverride } from "@/types/shipping";
import { SHIPPING_LINES } from "@/types/shipping";
import { getContractLog } from "@/lib/contract-log";
import {
  getShipping, saveShipping, createEmptyShipping, ensureShippingFields,
  getStatusInfo, calcTransitProgress, getTrackingLinks, calcAutoStatus,
} from "@/lib/shipping";
import { useShipping, useSaveShipping, shippingRowToEntry, shippingEntryToInput } from "@/lib/data/shipping";
import { useContractByNo } from "@/lib/data/contracts";
import { calcTotals } from "@/lib/sales-contract";
import { getShipsgoToken } from "@/lib/settings";
import { fetchShipmentFromShipsgo, mergeTrackIntoEntry, formatRelativeTime, isStale } from "@/lib/shipsgo";
import { useRouter } from "next/navigation";
import { findContractByNo, getWorkflow, advanceStage } from "@/lib/workflow";
import StageStrip from "@/components/workflow/StageStrip";
import ShippingDocsSection from "@/components/shipping/ShippingDocsSection";

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
  const [hasToken, setHasToken] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    conflicts: Array<{ field: string; current: string; incoming: string }>;
    next: ShippingEntry;
  } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTriggered = useRef(false);
  const initedRef = useRef<string | null>(null);
  const router = useRouter();

  // Supabase data layer (reads source of truth; dual-write target).
  const contractQuery = useContractByNo(contractNo);
  const contractRow = contractQuery.data;
  const contractId = contractRow?.id ?? null;
  const { data: shippingRow, isLoading: shippingLoading } = useShipping(contractId ?? undefined);
  const saveShippingMut = useSaveShipping(contractId ?? "");

  const showToast = useCallback((type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Keep the localStorage ContractLogEntry for StageStrip + workflow auto-advance
  // (those remain localStorage-backed, mirrored to Supabase via StageStrip).
  useEffect(() => {
    const log = getContractLog();
    setContract(log.find((e) => e.contractNo === contractNo) ?? null);
    setHasToken(!!getShipsgoToken());
  }, [contractNo]);

  // Initialize the editable shipping entry once — Supabase first, localStorage fallback.
  useEffect(() => {
    if (contractQuery.isLoading) return;
    if (contractId && shippingLoading) return; // wait for the shipping fetch
    if (initedRef.current === contractNo) return;
    initedRef.current = contractNo;

    const localC = getContractLog().find((e) => e.contractNo === contractNo) ?? null;
    const snap = contractRow?.master_snapshot ?? localC?.masterSnapshot;
    let e: ShippingEntry;
    if (shippingRow) {
      e = ensureShippingFields(shippingRowToEntry(contractNo, shippingRow));
    } else {
      const local = getShipping(contractNo);
      e = local
        ? ensureShippingFields(local)
        : createEmptyShipping(contractNo, {
            blNumber: snap?.identifiers.blNumber ?? "",
            containerNumber: snap?.identifiers.containerNumber ?? "",
            sealNumber: snap?.identifiers.sealNumber ?? "",
            portOfLoading: snap?.shipping.loadingPort ?? "",
            portOfDischarge: snap?.shipping.dischargePort ?? "",
          });
    }
    setEntry(e);
    setLoaded(true);
  }, [contractNo, contractId, contractQuery.isLoading, shippingLoading, shippingRow, contractRow]);

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    if (savedTimeout.current) clearTimeout(savedTimeout.current);
    savedTimeout.current = setTimeout(() => setSavedFlash(false), 1200);
  }, []);

  const persist = useCallback((next: ShippingEntry) => {
    // TRANSITIONAL DUAL-WRITE — remove in Batch 3 Step 7
    saveShipping(next);
    if (contractId) saveShippingMut.mutate(shippingEntryToInput(next));
    setEntry({ ...next });
    flashSaved();
  }, [flashSaved, contractId, saveShippingMut]);

  const update = useCallback(<K extends keyof ShippingEntry>(key: K, value: ShippingEntry[K]) => {
    setEntry((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const commit = useCallback(() => {
    if (entry) persist(entry);
  }, [entry, persist]);

  /** Save ATD + apply workflow auto-advance per spec. */
  const commitAtd = useCallback(() => {
    if (!entry) return;
    const newAtd = entry.atd;
    // Persist whatever value we have
    persist(entry);

    if (!newAtd) return; // cleared — no workflow action

    const c = findContractByNo(contractNo);
    if (!c) return;
    const wf = getWorkflow(c);
    if (wf.currentStage === "sc-sent-to-buyer") {
      try {
        advanceStage(c.id, "shipped", { by: "auto", triggeredBy: "ATD" });
        showToast("success", "\u2713 ATD saved. Stage advanced to Shipped.");
      } catch (e) {
        showToast("error", (e as Error).message);
      }
      return;
    }
    const earlyStages = ["costed", "docs-generated", "sent-to-factory"] as const;
    if (earlyStages.includes(wf.currentStage as (typeof earlyStages)[number])) {
      const proceed = confirm(
        "This contract hasn't reached 'SC Sent to Buyer' yet. Advance ATD anyway?\n\n" +
        "ATD will be saved but the workflow stage will NOT auto-advance. You'll need to catch up the workflow manually."
      );
      if (!proceed) {
        // Revert: clear the ATD and re-persist
        const reverted = { ...entry, atd: null };
        persist(reverted);
        showToast("info", "ATD reverted.");
      }
    }
    // Else (shipped/certs-ready/delivered): already past ATD, just saved — no further action
  }, [entry, contractNo, persist, showToast]);

  /** Save ATA + apply workflow auto-advance per spec. */
  const commitAta = useCallback(() => {
    if (!entry) return;
    persist(entry);
    if (!entry.ata) return;

    const c = findContractByNo(contractNo);
    if (!c) return;
    const wf = getWorkflow(c);
    if (wf.currentStage === "certs-ready") {
      try {
        advanceStage(c.id, "delivered", { by: "auto", triggeredBy: "ATA" });
        showToast("success", "\u2713 ATA saved. Stage advanced to Delivered.");
      } catch (e) {
        showToast("error", (e as Error).message);
      }
    } else if (wf.currentStage === "shipped") {
      showToast("info", "ATA saved. Complete 'Certs Ready' stage to finalize delivery.");
    }
  }, [entry, contractNo, persist, showToast]);

  const runFetch = useCallback(async (target: ShippingEntry, opts: { silent?: boolean } = {}) => {
    const token = getShipsgoToken();
    if (!token) {
      if (!opts.silent) {
        showToast("info", "Configure Shipsgo API in Settings first");
        router.push("/settings#shipsgo");
      }
      return;
    }
    setFetching(true);
    setFetchError(null);
    const result = await fetchShipmentFromShipsgo(target, token);
    setFetching(false);
    if (!result.success || !result.data) {
      if (!opts.silent) {
        setFetchError(result.error ?? "Failed to fetch tracking");
        showToast("error", result.error ?? "Failed to fetch tracking");
      }
      return;
    }
    const { next, conflicts } = mergeTrackIntoEntry(target, result.data);
    if (conflicts.length > 0 && !opts.silent) {
      setConflict({ conflicts, next });
    } else {
      persist(next);
      if (!opts.silent) showToast("success", "\u2713 Shipping data updated from Shipsgo");
    }
  }, [persist, router, showToast]);

  const handleAutoFill = useCallback(() => {
    if (!entry) return;
    if (!entry.blNumber && !entry.containerNumber) {
      showToast("error", "Enter a B/L or container number first");
      return;
    }
    runFetch(entry);
  }, [entry, runFetch, showToast]);

  const applyConflict = useCallback(() => {
    if (!conflict) return;
    persist(conflict.next);
    setConflict(null);
    showToast("success", "\u2713 Shipping data updated from Shipsgo");
  }, [conflict, persist, showToast]);

  const cancelConflict = useCallback(() => {
    if (!conflict) return;
    // Still save timestamp + requestId even when user rejects the field changes
    const refreshed: ShippingEntry = {
      ...entry!,
      shipsgoRequestId: conflict.next.shipsgoRequestId ?? entry!.shipsgoRequestId,
      lastAutoFetchAt: new Date().toISOString(),
    };
    persist(refreshed);
    setConflict(null);
    showToast("info", "Kept your values. Tracking ID cached for next refresh.");
  }, [conflict, entry, persist, showToast]);

  // Auto-refresh on page load when data is stale and we have a B/L + token
  useEffect(() => {
    if (!loaded || !entry || autoTriggered.current) return;
    if (!hasToken) return;
    if (!entry.blNumber && !entry.containerNumber) return;
    if (!isStale(entry.lastAutoFetchAt)) return;
    autoTriggered.current = true;
    runFetch(entry, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, hasToken]);

  const totals = useMemo(() => contract ? calcTotals(contract.masterSnapshot.lineItems, contract.masterSnapshot.terms?.numberOfContainers) : null, [contract]);

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

      {/* Last-updated + force-refresh bar */}
      {hasToken && (entry.blNumber || entry.containerNumber) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-2 text-xs dark:bg-zinc-900">
          <span className="flex items-center gap-2 text-zinc-500">
            <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin text-blue-500" : "text-zinc-400"}`} />
            {fetching
              ? "Checking Shipsgo\u2026"
              : entry.lastAutoFetchAt
                ? `Updated ${formatRelativeTime(entry.lastAutoFetchAt)} from Shipsgo`
                : "Not yet synced with Shipsgo"}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleAutoFill} disabled={fetching}>
              {fetching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              Force refresh
            </Button>
          </div>
        </div>
      )}
      {fetchError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg px-5 py-3 text-sm font-medium shadow-lg ${
          toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" :
          toast.type === "error" ? "border border-red-200 bg-red-50 text-red-800" :
          "border border-zinc-200 bg-white text-zinc-800 dark:bg-zinc-900"
        }`}>{toast.msg}</div>
      )}

      {/* Workflow stage tracker */}
      {contract && (
        <div className="rounded-lg border bg-white p-4 dark:bg-zinc-900">
          <p className="mb-3 text-sm font-semibold text-zinc-600">Workflow</p>
          <StageStrip contract={contract} />
        </div>
      )}

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
            <div className="flex gap-2">
              <Input value={entry.blNumber} onChange={(e) => update("blNumber", e.target.value)} onBlur={commit} placeholder="Bill of Lading number" className="flex-1" />
              <AutoFillButton
                disabled={fetching || (!entry.blNumber && !entry.containerNumber)}
                hasToken={hasToken}
                loading={fetching}
                onClick={handleAutoFill}
              />
            </div>
            {!hasToken && (
              <p className="mt-1 text-xs text-zinc-400">
                <Link href="/settings#shipsgo" className="underline hover:text-zinc-600">Configure Shipsgo API</Link> to enable auto-fill
              </p>
            )}
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
          <div><Label>ATD (Actual)</Label><Input type="date" value={entry.atd ?? ""} onChange={(e) => update("atd", e.target.value || null)} onBlur={commitAtd} /></div>
          <div><Label>ETA (Estimated)</Label><Input type="date" value={entry.eta} onChange={(e) => update("eta", e.target.value)} onBlur={commit} /></div>
          <div><Label>ATA (Actual)</Label><Input type="date" value={entry.ata ?? ""} onChange={(e) => update("ata", e.target.value || null)} onBlur={commitAta} /></div>
        </CardContent>
      </Card>

      {/* Container */}
      <Card>
        <CardHeader><CardTitle className="text-base">Container</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Container Number</Label>
            <div className="flex gap-2">
              <Input value={entry.containerNumber} onChange={(e) => update("containerNumber", e.target.value)} onBlur={commit} className="flex-1" />
              <AutoFillButton
                disabled={fetching || (!entry.blNumber && !entry.containerNumber)}
                hasToken={hasToken}
                loading={fetching}
                onClick={handleAutoFill}
                compact
              />
            </div>
          </div>
          <div><Label>Seal Number</Label><Input value={entry.sealNumber} onChange={(e) => update("sealNumber", e.target.value)} onBlur={commit} /></div>
        </CardContent>
      </Card>

      {/* B/L + Containers (canonical, persisted on contracts row) */}
      <ShippingDocsSection contract={contract} />

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

      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="mb-2 text-lg font-bold">Replace your edits?</h3>
            <p className="mb-4 text-sm text-zinc-500">
              Shipsgo returned different values for these fields. Your current values are shown on the left.
            </p>
            <div className="mb-5 max-h-72 space-y-2 overflow-y-auto">
              {conflict.conflicts.map((c) => (
                <div key={c.field} className="rounded border bg-zinc-50 p-2 text-xs dark:bg-zinc-800">
                  <p className="font-medium">{c.field}</p>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <div><p className="text-zinc-400">Current</p><p className="font-mono">{c.current || "(empty)"}</p></div>
                    <div><p className="text-emerald-600">Incoming</p><p className="font-mono">{c.incoming || "(empty)"}</p></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelConflict}>Keep mine</Button>
              <Button onClick={applyConflict}>Update from Shipsgo</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AutoFillButton({ disabled, hasToken, loading, onClick, compact }: {
  disabled: boolean;
  hasToken: boolean;
  loading: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "sm" : "default"}
      onClick={onClick}
      disabled={disabled}
      title={hasToken ? "Auto-fill from Shipsgo" : "Configure Shipsgo API in Settings to enable"}
      className="gap-1 whitespace-nowrap"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {compact ? "Auto-Fill" : "Auto-Fill from B/L"}
    </Button>
  );
}
