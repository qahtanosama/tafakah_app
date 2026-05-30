import type {
  ShippingEntry,
  ShippingStatus,
  ShippingStatusInfo,
  ShippingLine,
} from "@/types/shipping";

const STORAGE_KEY = "shipping-tracker";

export function getAllShipping(): ShippingEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ShippingEntry[];
  } catch {
    return [];
  }
}

function saveAll(data: ShippingEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getShipping(contractNo: string): ShippingEntry | null {
  return getAllShipping().find((s) => s.contractNo === contractNo) ?? null;
}

export function saveShipping(entry: ShippingEntry): void {
  entry.updatedAt = new Date().toISOString();
  const all = getAllShipping();
  const idx = all.findIndex((s) => s.contractNo === entry.contractNo);
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  saveAll(all);
}

export function deleteShipping(contractNo: string): void {
  const all = getAllShipping().filter((s) => s.contractNo !== contractNo);
  saveAll(all);
}

export function createEmptyShipping(contractNo: string, defaults?: { blNumber?: string; containerNumber?: string; sealNumber?: string; portOfLoading?: string; portOfDischarge?: string }): ShippingEntry {
  return {
    contractNo,
    shippingLine: "",
    bookingRef: "",
    vesselName: "",
    voyageNumber: "",
    blNumber: defaults?.blNumber ?? "",
    cutoffDate: "",
    loadingDate: "",
    etd: "",
    atd: null,
    eta: "",
    ata: null,
    portOfLoading: defaults?.portOfLoading ?? "",
    portOfDischarge: defaults?.portOfDischarge ?? "",
    containerNumber: defaults?.containerNumber ?? "",
    sealNumber: defaults?.sealNumber ?? "",
    statusOverride: "auto",
    notes: "",
    updatedAt: new Date().toISOString(),
    shipsgoRequestId: null,
    lastAutoFetchAt: null,
    freightBase: null,
    freightAdditional: null,
    freightChargeLabel: "",
    freightInvoiceDate: "",
    freightNotes: "",
  };
}

/** Migrate older entries missing new fields */
export function ensureShippingFields(entry: ShippingEntry): ShippingEntry {
  return {
    ...entry,
    portOfLoading: entry.portOfLoading ?? "",
    portOfDischarge: entry.portOfDischarge ?? "",
    shipsgoRequestId: entry.shipsgoRequestId ?? null,
    lastAutoFetchAt: entry.lastAutoFetchAt ?? null,
    freightBase: entry.freightBase ?? null,
    freightAdditional: entry.freightAdditional ?? null,
    freightChargeLabel: entry.freightChargeLabel ?? "",
    freightInvoiceDate: entry.freightInvoiceDate ?? "",
    freightNotes: entry.freightNotes ?? "",
  };
}

/** Compute today's date at midnight for stable day math */
function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse ISO date (yyyy-mm-dd) into midnight Date, or null */
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Calculate auto-status from dates (ignoring override) */
export function calcAutoStatus(entry: ShippingEntry | null): ShippingStatus {
  if (!entry) return "not_scheduled";
  const effectiveDeparture = parseDate(entry.atd) ?? parseDate(entry.etd);
  const effectiveArrival = parseDate(entry.ata) ?? parseDate(entry.eta);
  if (!effectiveDeparture) return "not_scheduled";
  const t = today();

  if (entry.ata) return "delivered";
  if (effectiveArrival && t.getTime() > effectiveArrival.getTime()) return "delayed";
  if (t.getTime() < effectiveDeparture.getTime()) return "pending";
  return "at_sea";
}

/** Resolve final status respecting manual override */
export function resolveStatus(entry: ShippingEntry | null): ShippingStatus {
  if (!entry) return "not_scheduled";
  if (entry.statusOverride === "auto") return calcAutoStatus(entry);
  return entry.statusOverride as ShippingStatus;
}

export function getStatusInfo(entry: ShippingEntry | null): ShippingStatusInfo {
  const status = resolveStatus(entry);
  const t = today();

  let daysLabel = "\u2014";
  if (entry && status !== "not_scheduled" && status !== "cancelled") {
    const dep = parseDate(entry.atd) ?? parseDate(entry.etd);
    const arr = parseDate(entry.ata) ?? parseDate(entry.eta);
    if (status === "delivered" && arr) {
      const d = daysBetween(arr, t);
      daysLabel = d === 0 ? "Arrived today" : d === 1 ? "Arrived 1 day ago" : `Arrived ${d} days ago`;
    } else if (status === "pending" && dep) {
      const d = daysBetween(t, dep);
      daysLabel = d === 0 ? "Departs today" : d === 1 ? "In 1 day" : `In ${d} days`;
    } else if (status === "at_sea" && arr) {
      const d = daysBetween(t, arr);
      daysLabel = d <= 0 ? "Arriving today" : d === 1 ? "1 day left" : `${d} days left`;
    } else if (status === "delayed" && arr) {
      const d = daysBetween(arr, t);
      daysLabel = d === 1 ? "1 day overdue" : `${d} days overdue`;
    }
  }

  const table: Record<ShippingStatus, Omit<ShippingStatusInfo, "daysLabel">> = {
    not_scheduled: { status: "not_scheduled", label: "Not Scheduled", icon: "\u23f3", badgeColor: "bg-zinc-100 text-zinc-500 border-zinc-200" },
    pending: { status: "pending", label: "Pending Departure", icon: "\ud83d\udfe1", badgeColor: "bg-amber-50 text-amber-700 border-amber-200" },
    at_sea: { status: "at_sea", label: "At Sea", icon: "\ud83d\udd35", badgeColor: "bg-blue-50 text-blue-700 border-blue-200" },
    delivered: { status: "delivered", label: "Delivered", icon: "\u2713", badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    delayed: { status: "delayed", label: "Delayed", icon: "\ud83d\udd34", badgeColor: "bg-red-50 text-red-700 border-red-200" },
    cancelled: { status: "cancelled", label: "Cancelled", icon: "\u274c", badgeColor: "bg-zinc-100 text-zinc-500 border-zinc-200 line-through" },
  };

  return { ...table[status], daysLabel };
}

/** Progress 0..1 between ETD and ETA (uses ATD/ATA when present) */
export function calcTransitProgress(entry: ShippingEntry | null): number {
  if (!entry) return 0;
  const dep = parseDate(entry.atd) ?? parseDate(entry.etd);
  const arr = parseDate(entry.ata) ?? parseDate(entry.eta);
  if (!dep || !arr) return 0;
  const t = today();
  if (t.getTime() <= dep.getTime()) return 0;
  if (t.getTime() >= arr.getTime()) return 1;
  const total = arr.getTime() - dep.getTime();
  const elapsed = t.getTime() - dep.getTime();
  return total > 0 ? elapsed / total : 0;
}

/** External tracking URL builders — returns only relevant ones per shipping line */
export interface TrackingLink {
  name: string;
  url: string;
}

export function getTrackingLinks(entry: ShippingEntry): TrackingLink[] {
  const links: TrackingLink[] = [];
  const vessel = entry.vesselName.trim();
  const bl = entry.blNumber.trim();
  const booking = entry.bookingRef.trim();

  if (vessel) {
    links.push({
      name: "VesselFinder",
      url: `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(vessel)}`,
    });
    links.push({
      name: "MarineTraffic",
      url: `https://www.marinetraffic.com/en/ais/details/ships/shipname:${encodeURIComponent(vessel)}`,
    });
  }

  const line: ShippingLine = entry.shippingLine;
  if (line === "Maersk" && (booking || bl)) {
    links.push({ name: "Maersk Tracking", url: `https://www.maersk.com/tracking/${encodeURIComponent(booking || bl)}` });
  } else if (line === "MSC") {
    links.push({ name: "MSC Tracking", url: "https://www.msc.com/en/track-a-shipment" });
  } else if (line === "COSCO" && bl) {
    links.push({ name: "COSCO Tracking", url: `https://elines.coscoshipping.com/ebtracking/public/bill/${encodeURIComponent(bl)}` });
  } else if (line === "Evergreen" && bl) {
    links.push({ name: "Evergreen Tracking", url: `https://www.evergreen-line.com/emodal/jsp/emodal/TBL1_BL.jsp?bl_no=${encodeURIComponent(bl)}` });
  } else if (line === "CMA CGM" && (booking || bl)) {
    links.push({ name: "CMA CGM Tracking", url: `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=BL&Reference=${encodeURIComponent(bl || booking)}` });
  } else if (line === "Hapag-Lloyd" && bl) {
    links.push({ name: "Hapag-Lloyd Tracking", url: `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${encodeURIComponent(bl)}` });
  } else if (line === "ONE" && bl) {
    links.push({ name: "ONE Tracking", url: `https://ecomm.one-line.com/ecom/CUP_HOM_3301.do?sessLocale=en&f_cmd=&l_cd=E&w_no=${encodeURIComponent(bl)}` });
  } else if (line === "WAN HAI" && bl) {
    links.push({ name: "WAN HAI Tracking", url: `https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml?ref_no=${encodeURIComponent(bl)}` });
  } else if (line === "PIL" && bl) {
    links.push({ name: "PIL Tracking", url: "https://www.pilship.com/en-our-track-and-trace-pil-pacific-international-lines/120.html" });
  }

  return links;
}
