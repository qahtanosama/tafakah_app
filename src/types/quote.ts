/**
 * Quote Calculator domain types.
 *
 * The calculator prices one shipment: N identical containers of one product.
 * Cost lines are entered in whatever currency and unit the supplier quotes in,
 * converted to USD, summed into a landed cost, then marked up to a sell price.
 *
 * UI lives in src/components/products/quote-calculator, math in src/lib/quote.
 */

export type Currency = "USD" | "RMB" | "EUR" | "SAR" | "AED" | "KWD";
export type ForeignCurrency = Exclude<Currency, "USD">;

/** How a cost line's amount scales with the shipment. */
export type CostUnit = "per_kg" | "per_mt" | "per_carton" | "per_container" | "flat";

/**
 * The six cost lines every shipment carries, in the order the team thinks
 * about them: farm gate -> packed -> on the water -> cleared -> delivered ->
 * paid. The sheet always renders these six; they cannot be renamed or removed.
 * Anything else (insurance, phyto, fumigation, a one-off port charge) is added
 * per shipment as an extra line.
 */
export const FIXED_COST_IDS = ["farm", "packing", "freight", "customs", "inland", "bank"] as const;
export type FixedCostId = (typeof FIXED_COST_IDS)[number];

export interface CostLine {
  /** A FixedCostId for the six standing lines, `x-<random>` for added ones. */
  id: FixedCostId | string;
  label: string;
  amount: number;
  currency: Currency;
  unit: CostUnit;
  /**
   * ISO timestamp of the last change to `amount`. Drives the staleness flag —
   * a farm price is only trustworthy for a few days. Absent on lines that have
   * never been costed, and on sheets saved before this was recorded.
   */
  updatedAt?: string;
}

/** 1 USD = <rate> of this currency. USD is implicit and always 1. */
export type FxRates = Record<ForeignCurrency, number>;

/** What is being shipped. `cartonsPerContainer` and the weights are per carton. */
export interface Cargo {
  productId: string;
  containers: number;
  cartonsPerContainer: number;
  nwPerCarton: number;
  gwPerCarton: number;
}

/** Shipment-wide quantities derived from Cargo. */
export interface CargoTotals {
  cartons: number;
  netKg: number;
  grossKg: number;
  qtyMTS: number;
}

export interface PricedLine {
  line: CostLine;
  /** Shipment total in USD, or null when the line's FX rate is missing/invalid. */
  usd: number | null;
  /** What the per-unit amount was multiplied by. 1 for a flat line. */
  factor: number;
  /** Noun for the factor — "cartons", "KG", "MT", "containers". Empty when flat. */
  factorNoun: string;
}

/** `error` blocks sending the quote; `warning` is worth knowing but not fatal. */
export type IssueLevel = "error" | "warning";

export interface QuoteIssue {
  level: IssueLevel;
  message: string;
}

export interface Quote {
  lines: PricedLine[];
  totals: CargoTotals;
  landedCost: number;
  costPerMT: number;
  costPerCarton: number;
  /** Margin actually applied, after clamping. */
  marginPct: number;
  /** Exact sell price before rounding — shown nowhere, kept for reference. */
  sellPerMT: number;
  /**
   * What we quote: whole dollars per MT. Everything below is derived from this
   * rather than from `sellPerMT`, so the panel, the quote text and the Master
   * Data handoff all reconcile (quotedPerMT x MT === quotedTotal).
   */
  quotedPerMT: number;
  quotedPerCarton: number;
  quotedTotal: number;
  profit: number;
  issues: QuoteIssue[];
  /** No errors — the numbers mean something and the quote can go out. */
  ready: boolean;
}

export interface MarginScenario {
  marginPct: number;
  perMT: number;
  perCarton: number;
  total: number;
}

/**
 * One product's costing on one day — a "session". The newest sheet for a
 * product is the working one; older sheets are history that can be reopened.
 * Persisted in public.product_cost_sheets (team-only).
 */
export interface CostSheet {
  id: string;
  productId: string;
  /** YYYY-MM-DD. One session per product per day. */
  sessionDate: string;
  lines: CostLine[];
  /** Rates this sheet was costed at, so reopening it reproduces its figures. */
  fx: FxRates;
  marginPct: number;
  /** What this session ended up quoting, for the history list. */
  quotedPerMT: number | null;
  cargo: Partial<Cargo>;
  updatedAt: string;
}

/** How a line's value ages. `stale` means past that cost's own refresh window. */
export interface LineFreshness {
  days: number;
  stale: boolean;
  /** Short human label — "today", "2 days ago", "Jun 28". */
  label: string;
}
