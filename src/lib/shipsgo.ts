import type { ShippingEntry } from "@/types/shipping";

const USAGE_KEY = "shipsgo-usage";
const FREE_TIER_LIMIT = 50;

export interface ShipsgoUsage {
  month: string;
  count: number;
  limit: number;
}

export interface TrackResult {
  requestId: string | null;
  shippingLine: string;
  vesselName: string;
  voyageNumber: string;
  etd: string;
  atd: string | null;
  eta: string;
  ata: string | null;
  portOfLoading: string;
  portOfDischarge: string;
  status: string;
  lastUpdated: string;
  rawResponse: unknown;
}

export interface TrackApiResponse {
  success: boolean;
  error?: string;
  errorCode?: "auth" | "not_found" | "rate_limit" | "quota" | "network" | "other";
  data?: TrackResult;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getUsage(): ShipsgoUsage {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    const month = currentMonth();
    if (!raw) return { month, count: 0, limit: FREE_TIER_LIMIT };
    const parsed = JSON.parse(raw) as ShipsgoUsage;
    if (parsed.month !== month) return { month, count: 0, limit: parsed.limit ?? FREE_TIER_LIMIT };
    return { month, count: parsed.count, limit: parsed.limit ?? FREE_TIER_LIMIT };
  } catch {
    return { month: currentMonth(), count: 0, limit: FREE_TIER_LIMIT };
  }
}

export function incrementUsage(): ShipsgoUsage {
  const u = getUsage();
  u.count += 1;
  localStorage.setItem(USAGE_KEY, JSON.stringify(u));
  return u;
}

export function setUsageLimit(limit: number): void {
  const u = getUsage();
  u.limit = Math.max(1, Math.round(limit));
  localStorage.setItem(USAGE_KEY, JSON.stringify(u));
}

export function isUsageAtLimit(): boolean {
  const u = getUsage();
  return u.count >= u.limit;
}

export function usageRemaining(): number {
  const u = getUsage();
  return Math.max(0, u.limit - u.count);
}

/** Call the tracking proxy. Client-side helper that handles token + usage. */
export async function fetchShipmentFromShipsgo(
  entry: ShippingEntry,
  token: string
): Promise<TrackApiResponse> {
  if (!token) return { success: false, error: "No Shipsgo token configured", errorCode: "auth" };
  if (!entry.blNumber && !entry.containerNumber) {
    return { success: false, error: "Enter a B/L or container number first", errorCode: "other" };
  }
  if (isUsageAtLimit()) {
    return { success: false, error: "Monthly API limit reached. Wait until next month or raise limit in Settings.", errorCode: "quota" };
  }

  try {
    const res = await fetch("/api/shipping/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        blNumber: entry.blNumber,
        containerNumber: entry.containerNumber,
        carrier: entry.shippingLine || undefined,
        cachedRequestId: entry.shipsgoRequestId || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error ?? `HTTP ${res.status}`, errorCode: data.errorCode ?? "other" };
    }
    incrementUsage();
    return { success: true, data: data.data as TrackResult };
  } catch (err) {
    return { success: false, error: (err as Error).message, errorCode: "network" };
  }
}

/** Merge normalized tracking data into an entry. Returns the new entry and a list of field conflicts. */
export function mergeTrackIntoEntry(
  entry: ShippingEntry,
  track: TrackResult
): { next: ShippingEntry; conflicts: Array<{ field: string; current: string; incoming: string }> } {
  const conflicts: Array<{ field: string; current: string; incoming: string }> = [];

  function merge<K extends keyof ShippingEntry>(field: K, incoming: ShippingEntry[K], label: string): ShippingEntry[K] {
    const current = entry[field];
    const currentStr = current == null ? "" : String(current);
    const incomingStr = incoming == null ? "" : String(incoming);
    if (!incomingStr) return current;
    if (currentStr && currentStr !== incomingStr) {
      conflicts.push({ field: label, current: currentStr, incoming: incomingStr });
    }
    return incoming;
  }

  const next: ShippingEntry = {
    ...entry,
    shippingLine: (track.shippingLine || entry.shippingLine) as ShippingEntry["shippingLine"],
    vesselName: merge("vesselName", track.vesselName, "Vessel"),
    voyageNumber: merge("voyageNumber", track.voyageNumber, "Voyage"),
    etd: merge("etd", track.etd, "ETD"),
    atd: track.atd ? merge("atd", track.atd, "ATD") : entry.atd,
    eta: merge("eta", track.eta, "ETA"),
    ata: track.ata ? merge("ata", track.ata, "ATA") : entry.ata,
    portOfLoading: merge("portOfLoading", track.portOfLoading, "Port of Loading"),
    portOfDischarge: merge("portOfDischarge", track.portOfDischarge, "Port of Discharge"),
    shipsgoRequestId: track.requestId ?? entry.shipsgoRequestId,
    lastAutoFetchAt: new Date().toISOString(),
  };
  if (track.shippingLine && entry.shippingLine && entry.shippingLine !== track.shippingLine) {
    conflicts.push({ field: "Shipping Line", current: entry.shippingLine, incoming: track.shippingLine });
  }

  return { next, conflicts };
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "Never";
  const diffMs = Date.now() - t;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function isStale(iso: string | null, hoursThreshold = 6): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return true;
  return Date.now() - t > hoursThreshold * 60 * 60 * 1000;
}
