/**
 * Quote pricing — pure functions, no React, no storage, no I/O.
 *
 * Everything the calculator shows comes out of `computeQuote`. Keeping it here
 * means the numbers can be reasoned about (and tested) without a browser.
 */

import type {
  Cargo,
  CargoTotals,
  CostLine,
  CostUnit,
  Currency,
  FxRates,
  MarginScenario,
  PricedLine,
  Quote,
  QuoteIssue,
} from "@/types/quote";
import { MAX_MARGIN, isFixedLine } from "./defaults";

/**
 * Rates are quoted as "1 USD = <rate> CUR", so converting to USD divides.
 * Returns null — not 0 — when the rate is missing or non-positive, so a broken
 * rate surfaces as a visible problem instead of silently pricing a line at $0.
 */
export function convertToUSD(amount: number, currency: Currency, fx: FxRates): number | null {
  if (currency === "USD") return amount;
  const rate = fx[currency];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return amount / rate;
}

/**
 * USD -> a foreign currency. The inverse of convertToUSD, used to show a Gulf
 * buyer's price in their own currency. Null when the rate is unusable, so the
 * caller omits the line rather than printing a confident wrong number.
 */
export function convertFromUSD(amountUSD: number, currency: Currency, fx: FxRates): number | null {
  if (currency === "USD") return amountUSD;
  const rate = fx[currency];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return amountUSD * rate;
}

function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function cargoTotals(cargo: Cargo): CargoTotals {
  const containers = nonNegative(cargo.containers);
  const cartons = nonNegative(cargo.cartonsPerContainer) * containers;
  const netKg = cartons * nonNegative(cargo.nwPerCarton);
  return {
    cartons,
    netKg,
    grossKg: cartons * nonNegative(cargo.gwPerCarton),
    qtyMTS: netKg / 1000,
  };
}

/** What a per-unit amount gets multiplied by for this shipment. */
function unitFactor(
  unit: CostUnit,
  totals: CargoTotals,
  containers: number
): { factor: number; factorNoun: string } {
  switch (unit) {
    case "per_kg":
      return { factor: totals.netKg, factorNoun: "KG" };
    case "per_mt":
      return { factor: totals.qtyMTS, factorNoun: "MT" };
    case "per_carton":
      return { factor: totals.cartons, factorNoun: "cartons" };
    case "per_container":
      return { factor: nonNegative(containers), factorNoun: "containers" };
    case "flat":
      return { factor: 1, factorNoun: "" };
  }
}

export function priceLine(
  line: CostLine,
  totals: CargoTotals,
  containers: number,
  fx: FxRates
): PricedLine {
  const perUnitUSD = convertToUSD(line.amount, line.currency, fx);
  const { factor, factorNoun } = unitFactor(line.unit, totals, containers);
  return {
    line,
    usd: perUnitUSD === null ? null : perUnitUSD * factor,
    factor,
    factorNoun,
  };
}

/** Keeps the margin inside the range where the markup formula behaves. */
export function clampMargin(marginPct: number): number {
  if (!Number.isFinite(marginPct)) return 0;
  return Math.min(MAX_MARGIN, Math.max(0, marginPct));
}

/** Sell price that yields `marginPct` of revenue as gross margin. */
function markUp(costPerMT: number, marginPct: number): number {
  if (costPerMT <= 0) return 0;
  return costPerMT / (1 - clampMargin(marginPct) / 100);
}

export interface QuoteInput {
  lines: CostLine[];
  cargo: Cargo;
  fx: FxRates;
  marginPct: number;
  /** False while the product list is still loading or nothing is selected. */
  productSelected: boolean;
}

export function computeQuote(input: QuoteInput): Quote {
  const totals = cargoTotals(input.cargo);
  const lines = input.lines.map((l) => priceLine(l, totals, input.cargo.containers, input.fx));

  // Unconvertible lines contribute nothing; `issues` reports them by name.
  const landedCost = lines.reduce((sum, p) => sum + (p.usd ?? 0), 0);
  const costPerMT = totals.qtyMTS > 0 ? landedCost / totals.qtyMTS : 0;
  const costPerCarton = totals.cartons > 0 ? landedCost / totals.cartons : 0;

  const marginPct = clampMargin(input.marginPct);
  const sellPerMT = markUp(costPerMT, marginPct);

  // Quote in whole dollars per MT, then derive the carton price and the total
  // from that rounded figure. Deriving them independently from `sellPerMT`
  // would leave the buyer able to show that our own numbers disagree.
  const quotedPerMT = Math.round(sellPerMT);
  const quotedPerCarton = (quotedPerMT * nonNegative(input.cargo.nwPerCarton)) / 1000;
  const quotedTotal = quotedPerMT * totals.qtyMTS;

  const issues = collectIssues(input, totals, lines);

  return {
    lines,
    totals,
    landedCost,
    costPerMT,
    costPerCarton,
    marginPct,
    sellPerMT,
    quotedPerMT,
    quotedPerCarton,
    quotedTotal,
    profit: quotedTotal - landedCost,
    issues,
    ready: !issues.some((i) => i.level === "error"),
  };
}

function collectIssues(input: QuoteInput, totals: CargoTotals, lines: PricedLine[]): QuoteIssue[] {
  const issues: QuoteIssue[] = [];
  const error = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });

  if (!input.productSelected) error("Pick a product.");
  if (nonNegative(input.cargo.containers) < 1) error("Enter at least 1 container.");
  if (nonNegative(input.cargo.cartonsPerContainer) <= 0) error("Enter cartons per container.");
  if (nonNegative(input.cargo.nwPerCarton) <= 0) {
    error("Enter net weight per carton — quantity and price per MT both depend on it.");
  }
  // Printed on the quote, so a missing value would go out as "0.0 KG / carton".
  if (nonNegative(input.cargo.gwPerCarton) <= 0) {
    error("Enter gross weight per carton — it is stated on the quote.");
  }

  const unconvertible = [...new Set(lines.filter((p) => p.usd === null).map((p) => p.line.currency))];
  if (unconvertible.length > 0) {
    error(
      `No exchange rate for ${unconvertible.join(", ")} — those lines are excluded from the landed cost.`
    );
  }

  const farm = lines.find((p) => p.line.id === "farm");
  if (farm && farm.line.amount <= 0) error("Farm price is 0 — there is nothing to mark up yet.");

  const uncosted = lines
    .filter((p) => p.line.id !== "farm" && isFixedLine(p.line.id) && p.line.amount <= 0)
    .map((p) => p.line.label.toLowerCase());
  if (uncosted.length > 0) warn(`Still at zero: ${uncosted.join(", ")}.`);

  if (clampMargin(input.marginPct) !== input.marginPct) {
    warn(`Margin capped at ${MAX_MARGIN}%.`);
  }
  // Gross below net is physically impossible — packaging only adds weight.
  const nw = nonNegative(input.cargo.nwPerCarton);
  const gw = nonNegative(input.cargo.gwPerCarton);
  if (nw > 0 && gw > 0 && gw < nw) {
    warn("Gross weight is below net weight — check the two are not swapped.");
  }

  const unnamed = lines.filter((p) => !isFixedLine(p.line.id) && !p.line.label.trim() && p.line.amount > 0);
  if (unnamed.length > 0) warn("An added cost line has an amount but no name.");

  return issues;
}

/** "What if we quoted at 10/15/20/25/30%" — same rounding rule as the real quote. */
export function marginScenarios(
  costPerMT: number,
  totals: CargoTotals,
  nwPerCarton: number,
  margins: number[]
): MarginScenario[] {
  return margins.map((marginPct) => {
    const perMT = Math.round(markUp(costPerMT, marginPct));
    return {
      marginPct,
      perMT,
      perCarton: (perMT * nonNegative(nwPerCarton)) / 1000,
      total: perMT * totals.qtyMTS,
    };
  });
}
