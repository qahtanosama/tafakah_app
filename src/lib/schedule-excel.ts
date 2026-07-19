// Client-side parsing of a carrier sailing-schedule Excel sheet into
// SailingInput rows. Header names vary per carrier/forwarder, so columns are
// matched by fuzzy header patterns and everything lands in an EDITABLE
// preview before import — mis-detected cells are fixed by hand, not by code.
//
// Modeled on the real forwarder sheet:
//   POL | POD | SHIPPING LIST | VESSEL/VOYAGE | ETD | ETA | TRANSIT DAY |
//   OCEAN FREIGHT | BOOKING PLAN | SPACE RELEASE STATUS | REMARK
// with product-group separator rows ("FRESH CARROTS") between sections,
// combined vessel+voyage cells (sometimes multi-line), y/m/d slash dates,
// and rows whose vessel is not yet nominated.

import * as XLSX from "xlsx";
import type { SailingInput } from "@/types/schedule";

export const EMPTY_SAILING: SailingInput = {
  shippingLine: "",
  vessel: "",
  voyage: null,
  portOfLoading: null,
  destination: null,
  etd: null,
  eta: null,
  cargoCutoff: null,
  docCutoff: null,
  transitDays: null,
  commodity: null,
  notes: null,
  oceanFreight: null,
  bookingPlan: null,
  spaceRelease: null,
  remark: null,
};

/** Column kinds we can detect. vesselVoyage is a combined column that gets split. */
type ColumnKey = Exclude<keyof SailingInput, "notes"> | "vesselVoyage";

// Order matters: the first pattern that matches a header claims the column.
//   - docCutoff before cargoCutoff so cargoCutoff's generic "cut-off"
//     alternative (negative lookahead over the whole cell) never swallows a
//     doc/SI/BL column, wherever it sits in the sheet.
//   - vesselVoyage before voyage/vessel so "VESSEL/VOYAGE" is claimed as the
//     combined column rather than as voyage alone.
//   - Sheet remarks/notes go to the INTERNAL remark field, never to the
//     client-visible notes.
const HEADER_PATTERNS: Array<{ field: ColumnKey; pattern: RegExp }> = [
  { field: "docCutoff", pattern: /\b(docs?|si|bl|shipping instructions?)\b.{0,10}(cut|clos|dead)/i },
  { field: "cargoCutoff", pattern: /(cargo|cy|container|gate).{0,6}(cut|clos)|^(?!.*\b(docs?|si|bl|instructions?)\b).*cut.?off/i },
  { field: "etd", pattern: /etd|departure|sailing date|dep\.?\s|sails?\b/i },
  { field: "eta", pattern: /eta|arrival|arr\.?\s/i },
  { field: "transitDays", pattern: /transit|t\/t\b|tt\s*days?/i },
  { field: "vesselVoyage", pattern: /vessel\s*[\/|&+~-]\s*voy|vessel.?voyage/i },
  { field: "voyage", pattern: /voy/i },
  { field: "vessel", pattern: /vessel|\bship\b|\bmv\b|feeder/i },
  { field: "shippingLine", pattern: /shipping\s*list|line|carrier|operator|company/i },
  { field: "portOfLoading", pattern: /pol\b|loading|origin|\bfrom\b/i },
  { field: "destination", pattern: /pod\b|discharge|destination|\bto\b|port of dest/i },
  { field: "commodity", pattern: /commodit|product/i },
  { field: "oceanFreight", pattern: /freight|\brate\b|o\/f\b/i },
  { field: "bookingPlan", pattern: /booking/i },
  { field: "spaceRelease", pattern: /space|releas/i },
  { field: "remark", pattern: /note|remark|comment/i },
];

const DATE_FIELDS: ReadonlySet<ColumnKey> = new Set(["etd", "eta", "cargoCutoff", "docCutoff"]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  // A Date sitting exactly on UTC midnight is a date-only value from a
  // UTC-based parser — read it with UTC getters, or negative-offset
  // timezones would report the previous day.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Normalize an Excel cell into YYYY-MM-DD, or null if unparseable. */
export function parseCellDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return toIsoDate(value);
  if (typeof value === "number") {
    // Excel serial date — SSF is pure calendar math, immune to timezones.
    // (The workbook is deliberately read WITHOUT cellDates so date cells
    // arrive here as serials, keeping parsing deterministic.)
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
  }
  const s = String(value).trim();
  if (!s) return null;

  // Year-first: 2026-08-08, 2026/7/25, 2026.7.25
  const ymd = s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (ymd) return `${ymd[1]}-${pad(+ymd[2])}-${pad(+ymd[3])}`;

  // Day-first numeric formats (dd/mm/yyyy, dd-mm-yy) — carrier sheets in this
  // region are day-first, so 03/07 is 3 July, never March 7.
  const dmy = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
  if (dmy) {
    const now = new Date();
    const year = dmy[3] ? (+dmy[3] < 100 ? 2000 + +dmy[3] : +dmy[3]) : now.getFullYear();
    const month = +dmy[2];
    const day = +dmy[1];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  // Textual formats ("24 Jul", "Jul 24 2026") — add current year when absent.
  // Require an explicit month name: without this, junk like "n/a" or "TBA"
  // gets a year appended and V8's lenient parser fabricates a date from it.
  if (!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s)) return null;
  const hasYear = /\d{4}/.test(s);
  const d = new Date(hasYear ? s : `${s} ${new Date().getFullYear()}`);
  return toIsoDate(d);
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return parseCellDate(value) ?? "";
  return String(value).trim();
}

/**
 * Split a combined "VESSEL/VOYAGE" cell.
 *   "CMA CGM BENJAMIN FRANKLIN\n0RDOMW1MA"  → newline separates the two
 *   "KOTA ORKID 0009W" / "WAN HAI 372  W029" → last token is the voyage when
 *     it mixes letters AND digits (pure numbers like "372" stay in the vessel
 *     name — many vessels end in a number).
 */
export function splitVesselVoyage(raw: string): { vessel: string; voyage: string | null } {
  const lines = raw.split(/[\r\n]+/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.length >= 2) {
    return { vessel: lines[0], voyage: lines.slice(1).join(" ") || null };
  }
  const text = lines[0] ?? "";
  const tokens = text.split(" ").filter(Boolean);
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    if (/\d/.test(last) && /[a-z]/i.test(last) && last.length <= 12) {
      return { vessel: tokens.slice(0, -1).join(" "), voyage: last };
    }
  }
  return { vessel: text, voyage: null };
}

export interface ParsedSheet {
  rows: SailingInput[];
  /** Fields that no header matched — shown as a hint above the preview. */
  unmatched: ColumnKey[];
}

/**
 * Parse the first worksheet. The header row is auto-detected: the first row
 * (within the top 15) whose cells match at least a vessel (or combined
 * vessel/voyage) column plus one date column wins.
 *
 * A row with exactly one non-empty, digit-free cell is a product-group
 * separator ("FRESH CARROTS") — its text becomes the commodity of the rows
 * that follow. Rows keep their place in the preview even when the vessel is
 * not yet nominated (empty vessel cell but real dates), so the team can type
 * "TBN" or delete them; the server skips vessel-less rows on import.
 */
export function parseScheduleWorkbook(data: ArrayBuffer): ParsedSheet {
  // No cellDates: date cells stay raw serial numbers, which parseCellDate
  // converts with timezone-free calendar math (SSF). cellDates:true would
  // produce JS Dates whose local/UTC interpretation shifts by timezone.
  const wb = XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], unmatched: [] };

  const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  let headerIdx = -1;
  let mapping = new Map<number, ColumnKey>();
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const candidate = new Map<number, ColumnKey>();
    const claimed = new Set<ColumnKey>();
    (grid[i] ?? []).forEach((cell, col) => {
      const text = cellText(cell);
      if (!text) return;
      for (const { field, pattern } of HEADER_PATTERNS) {
        if (!claimed.has(field) && pattern.test(text)) {
          candidate.set(col, field);
          claimed.add(field);
          return;
        }
      }
    });
    const hasVessel = claimed.has("vessel") || claimed.has("vesselVoyage");
    if (hasVessel && (claimed.has("etd") || claimed.has("eta"))) {
      headerIdx = i;
      mapping = candidate;
      break;
    }
  }
  if (headerIdx === -1) return { rows: [], unmatched: [] };

  const rows: SailingInput[] = [];
  let currentCommodity: string | null = null;

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const raw = grid[i] ?? [];

    // Product-group separator row: one lone text cell, no digits.
    const nonEmpty = raw.map(cellText).filter((t) => t.length > 0);
    if (nonEmpty.length === 1 && !/\d/.test(nonEmpty[0])) {
      currentCommodity = nonEmpty[0];
      continue;
    }

    const row: SailingInput = { ...EMPTY_SAILING, commodity: currentCommodity };
    let hasValue = false;
    for (const [col, field] of mapping) {
      const value = raw[col];
      if (DATE_FIELDS.has(field)) {
        const date = parseCellDate(value);
        if (date) hasValue = true;
        (row[field as "etd"] as string | null) = date;
      } else if (field === "transitDays") {
        const n = parseInt(cellText(value), 10);
        row.transitDays = Number.isFinite(n) && n >= 0 ? n : null;
        if (row.transitDays !== null) hasValue = true;
      } else if (field === "vesselVoyage") {
        const text = String(value ?? "").trim();
        if (text) {
          hasValue = true;
          const { vessel, voyage } = splitVesselVoyage(text);
          row.vessel = vessel;
          if (!row.voyage) row.voyage = voyage;
        }
      } else {
        const text = cellText(value);
        if (text) hasValue = true;
        if (field === "shippingLine" || field === "vessel") row[field] = text;
        else if (field === "commodity") row.commodity = text || currentCommodity;
        else (row[field as "voyage"] as string | null) = text || null;
      }
    }
    // Keep vessel-less rows that clearly describe a sailing (dates present):
    // the team completes or deletes them in the preview.
    if (hasValue && (row.vessel || row.etd || row.eta)) rows.push(row);
  }

  const matched = new Set(mapping.values());
  if (matched.has("vesselVoyage")) {
    matched.add("vessel");
    matched.add("voyage");
  }
  const unmatched = (
    ["shippingLine", "vessel", "voyage", "portOfLoading", "destination", "etd", "eta", "cargoCutoff", "docCutoff", "transitDays"] as ColumnKey[]
  ).filter((f) => !matched.has(f));

  return { rows, unmatched };
}
