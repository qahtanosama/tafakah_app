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
 * Every standing cost line, across every market, in journey order: farm gate ->
 * packed -> carried -> cleared -> taxed -> paid. A market renders its own
 * subset and they cannot be renamed or removed. Anything else (insurance,
 * phyto, fumigation, a one-off port charge) is added per shipment as an extra
 * line.
 *
 * The Gulf ships the first six by sea. The Russian overland route adds `border`
 * (transhipment at the Khorgos gauge break) and `transit` (the Kazakh per-ton
 * tax) — see src/lib/quote/markets.ts.
 */
export const FIXED_COST_IDS = [
  "farm",
  "packing",
  "freight",
  "customs",
  "inland",
  "bank",
  // Overland only — see src/lib/quote/markets.ts. This tuple is the UNION
  // across every market so `isFixedLine()` stays a single global check; which
  // lines a market actually renders, and in what order, comes from its own
  // `costLines()`.
  "border",
  "transit",
] as const;
export type FixedCostId = (typeof FIXED_COST_IDS)[number];

/** Which market a quote, cost sheet or pack format belongs to. */
export type MarketId = "gulf" | "russia";

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
  /**
   * The named places printed as "FOB <loading>" and "CIF <discharge>". Chosen
   * per quote — the destination changes with the buyer, and a quote that says
   * CIF Jeddah to a Khor Fakkan buyer is simply wrong. Stored with the cost
   * sheet so a re-quote keeps the route.
   */
  loadingPort: string;
  dischargePort: string;
  /**
   * Estimated departure of the vessel, as YYYY-MM-DD. Required on the quote so
   * the buyer knows the sailing the price is tied to — a price with no departure
   * is not a shippable offer, and freight moves between sailings.
   */
  etd: string;
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

/**
 * Which problem, not its wording. The pricing layer is pure and language-free;
 * the panel looks the code up in the team dictionary, so the same quote reports
 * its problems in English or Chinese without the math knowing either exists.
 */
export type QuoteIssueCode =
  | "noProduct"
  | "containers"
  | "cartons"
  | "netWeight"
  | "grossWeight"
  | "noFx"
  | "farmZero"
  | "uncosted"
  | "marginCapped"
  | "weightsSwapped"
  | "unnamedLine"
  | "noEtd";

export interface QuoteIssue {
  level: IssueLevel;
  code: QuoteIssueCode;
  /** Values interpolated into the message, e.g. { currencies: "RMB" }. */
  params?: Record<string, string | number>;
}

export interface Quote {
  lines: PricedLine[];
  totals: CargoTotals;
  landedCost: number;
  costPerMT: number;
  costPerCarton: number;
  /** Margin actually applied, after clamping. */
  marginPct: number;
  /** Exact per-MT sell price before rounding — reference only. */
  sellPerMT: number;

  /* ── FOB / CIF ────────────────────────────────────────────────────────
   * Margin is earned on the goods; sea freight is passed through at cost. So
   * `cifPerCarton - fobPerCarton === freightPerCarton` exactly, which is what
   * lets a freight rise be restated without reopening the price.
   */
  /** Sea freight for the whole shipment, in USD. */
  freightUSD: number;
  /** Landed cost excluding sea freight. */
  fobCost: number;
  /** The firm price: FOB cost per carton plus margin, in whole cents. */
  fobPerCarton: number;
  fobTotal: number;
  /** Freight per carton at cost — the volatile component. */
  freightPerCarton: number;
  /** fobPerCarton + freightPerCarton. */
  cifPerCarton: number;

  /**
   * CIF price per MT in whole dollars, for display. Derived from the carton
   * price, which is authoritative — so this may not multiply exactly to
   * `quotedTotal`.
   */
  quotedPerMT: number;
  /** CIF per MT to the cent, for the contract handoff. */
  contractPerMT: number;
  /** Alias of `cifPerCarton` — what the buyer pays per box. */
  quotedPerCarton: number;
  /** cifPerCarton x cartons. Exact. */
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

/**
 * How a line's value ages. `stale` means past that cost's own refresh window.
 *
 * Reports the age, not its wording — the component picks "today" / "2 days ago"
 * / a formatted date from the team dictionary, so this stays language-free.
 */
export interface LineFreshness {
  days: number;
  stale: boolean;
  /** When the amount was last changed, for formatting an older date. */
  at: Date;
}
