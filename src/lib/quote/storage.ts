/**
 * Per-browser calculator storage.
 *
 * Only two things live here now:
 *
 *  1. The quote language — a personal UI preference.
 *  2. A ONE-TIME read of the old `calculator.defaults` key, used to seed the
 *     first Supabase cost sheet on a machine that used the previous version.
 *     Without it, fees the team had carefully entered would vanish the day
 *     cost sheets moved to Supabase.
 *
 * Cost sheets themselves are per product and team-shared — see
 * lib/data/cost-sheets.ts. Nothing writes cost lines to localStorage any more.
 */

import type { CostLine, CostUnit, Currency, FixedCostId, FxRates } from "@/types/quote";
import { DEFAULT_FX, DEFAULT_MARGIN, defaultCostLines, isFixedLine } from "./defaults";

const LEGACY_KEY = "calculator.defaults";
const LANG_KEY = "calculator.quoteLanguage";

export type QuoteLang = "en" | "ar" | "ru";

const QUOTE_LANGS: QuoteLang[] = ["en", "ar", "ru"];

export function loadLang(): QuoteLang {
  try {
    const stored = localStorage.getItem(LANG_KEY) as QuoteLang | null;
    // Anything unrecognised falls back to English. The old check compared
    // against "ar" alone, which would have swallowed a stored "ru".
    return stored && QUOTE_LANGS.includes(stored) ? stored : "en";
  } catch {
    return "en";
  }
}

export function saveLang(lang: QuoteLang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Storage blocked — losing a language preference is not worth interrupting a quote.
  }
}

/* ── legacy seed ───────────────────────────────────────────────────────── */

export interface LegacySheet {
  lines: CostLine[];
  fx: FxRates;
  marginPct: number;
}

interface StoredLine {
  id?: unknown;
  label?: unknown;
  amount?: unknown;
  currency?: unknown;
  unit?: unknown;
  updatedAt?: unknown;
}

const VALID_UNITS: CostUnit[] = ["per_kg", "per_mt", "per_carton", "per_container", "flat"];
const VALID_CURRENCIES: Currency[] = ["USD", "RMB", "EUR", "SAR", "AED", "KWD"];

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function currency(v: unknown, fallback: Currency): Currency {
  return VALID_CURRENCIES.includes(v as Currency) ? (v as Currency) : fallback;
}
function unit(v: unknown, fallback: CostUnit): CostUnit {
  return VALID_UNITS.includes(v as CostUnit) ? (v as CostUnit) : fallback;
}

/** Overlay a stored row onto a default line, keeping the default's identity. */
function applyStored(base: CostLine, stored: StoredLine | undefined, keepUnit: boolean): CostLine {
  if (!stored) return base;
  return {
    ...base,
    amount: num(stored.amount),
    currency: currency(stored.currency, base.currency),
    unit: keepUnit ? unit(stored.unit, base.unit) : base.unit,
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : undefined,
  };
}

/* v1 stored { mainCosts, addOns, customItems, fxRates, targetMargin }. Its
 * add-on rows were locked to "flat" — their unit dropdown had exactly one
 * option — so a v1 add-on unit carries no user intent and is discarded in favour
 * of the current default. That is what lets per-container fees finally scale
 * with the container count. v1 main-cost units were real choices and are kept. */

/** v1 line id -> the standing line it became. */
const V1_MAIN: Record<string, FixedCostId> = { supplier: "farm", packing: "packing", freight: "freight" };
const V1_ADDON: Record<string, FixedCostId> = { customs: "customs", trucking: "inland", bank: "bank" };

/**
 * v1 add-ons with no equivalent among the six standing lines. Carried across as
 * added lines only when the amount differs from v1's hardcoded default — an
 * untouched default was never a real cost, but a number somebody typed is.
 */
const V1_DROPPED: Record<string, { label: string; hardcodedDefault: number }> = {
  exp: { label: "Export fee (EXP)", hardcodedDefault: 450 },
  insurance: { label: "Insurance", hardcodedDefault: 150 },
  inspection: { label: "Inspection / Phyto", hardcodedDefault: 220 },
};

function migrateV1(raw: Record<string, unknown>): CostLine[] {
  const mainCosts = (Array.isArray(raw.mainCosts) ? raw.mainCosts : []) as StoredLine[];
  const addOns = (Array.isArray(raw.addOns) ? raw.addOns : []) as StoredLine[];
  const customItems = (Array.isArray(raw.customItems) ? raw.customItems : []) as StoredLine[];
  const find = (rows: StoredLine[], id: string) => rows.find((r) => r.id === id);

  const lines = defaultCostLines().map((base) => {
    const mainId = Object.keys(V1_MAIN).find((k) => V1_MAIN[k] === base.id);
    if (mainId) return applyStored(base, find(mainCosts, mainId), true);
    const addonId = Object.keys(V1_ADDON).find((k) => V1_ADDON[k] === base.id);
    if (addonId) return applyStored(base, find(addOns, addonId), false);
    return base;
  });

  for (const [id, meta] of Object.entries(V1_DROPPED)) {
    const stored = find(addOns, id);
    const amount = num(stored?.amount);
    if (!stored || amount === meta.hardcodedDefault || amount === 0) continue;
    lines.push({
      id: `x-${id}`,
      label: meta.label,
      amount,
      currency: currency(stored.currency, "USD"),
      unit: "flat",
    });
  }
  for (const row of customItems) {
    if (num(row.amount) === 0 && typeof row.label === "string" && !row.label.trim()) continue;
    lines.push({
      id: typeof row.id === "string" && row.id ? row.id : `x-${crypto.randomUUID().slice(0, 8)}`,
      label: typeof row.label === "string" ? row.label : "",
      amount: num(row.amount),
      currency: currency(row.currency, "USD"),
      unit: unit(row.unit, "flat"),
    });
  }

  return lines;
}

function migrateV2(rows: StoredLine[]): CostLine[] {
  const lines = defaultCostLines().map((base) =>
    applyStored(base, rows.find((r) => r.id === base.id), true)
  );
  for (const row of rows) {
    if (typeof row.id !== "string" || isFixedLine(row.id)) continue;
    lines.push({
      id: row.id,
      label: typeof row.label === "string" ? row.label : "",
      amount: num(row.amount),
      currency: currency(row.currency, "USD"),
      unit: unit(row.unit, "per_container"),
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
    });
  }
  return lines;
}

/**
 * A rate of 0 is always a mistake — usually a cleared input that got persisted —
 * and it silently voids every line in that currency. Repair on read.
 */
function sanitizeFx(stored: unknown): FxRates {
  const merged = { ...DEFAULT_FX, ...(typeof stored === "object" && stored ? stored : {}) } as FxRates;
  for (const k of Object.keys(DEFAULT_FX) as (keyof FxRates)[]) {
    const rate = merged[k];
    if (!Number.isFinite(rate) || rate <= 0) merged[k] = DEFAULT_FX[k];
  }
  return merged;
}

/**
 * The old per-browser cost defaults, or null if this browser never used the
 * previous calculator. Read-only: the returned sheet gets saved to Supabase as
 * a normal session on the user's first edit, after which this key is dead.
 */
export function legacyLocalSheet(): LegacySheet | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Record<string, unknown>;

    const lines =
      stored.v === 2 && Array.isArray(stored.lines)
        ? migrateV2(stored.lines as StoredLine[])
        : migrateV1(stored);

    // Nothing was ever actually costed — not worth seeding from.
    if (!lines.some((l) => l.amount > 0)) return null;

    const margin = num(stored.marginPct ?? stored.targetMargin);
    return {
      lines,
      fx: sanitizeFx(stored.fxRates ?? stored.fx),
      marginPct: margin > 0 ? margin : DEFAULT_MARGIN,
    };
  } catch {
    return null;
  }
}
