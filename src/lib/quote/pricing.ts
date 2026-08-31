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
  /**
   * What the margin is applied to — see the Market profile. Optional so every
   * existing caller keeps the Gulf behaviour it was written against.
   */
  markupBase?: "goods" | "landed";
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

  /* ── base / delivered split ───────────────────────────────────────────
   * Under `markupBase: "goods"` (the Gulf) the main carriage is a pass-through
   * at cost and the margin is earned on the goods only. That is what makes
   * CIF − FOB exactly equal the freight: when the rate jumps mid-negotiation
   * the freight figure is restated on its own and the margin never enters the
   * conversation. Marking up the full CIF cost instead would leave CIF − FOB
   * larger than the freight, so a buyer subtracting one from the other would
   * derive a freight number that does not match the invoice.
   *
   * Under `markupBase: "landed"` (Russia) there is no such conversation — the
   * whole price is renegotiated weekly — so the margin sits on the entire
   * landed cost and no base price is reported at all. Marking up only the goods
   * there would quietly earn LESS than the margin control says, because the
   * carriage would ride along at cost inside a single quoted figure.
   *
   * Everything is quoted per carton in whole cents, because that is the figure
   * the buyer negotiates and checks. The total is carton price × cartons, so
   * the two always reconcile; price per MT is derived for display and for the
   * contract, where produce is written per MT.
   */
  const freightUSD = lines.find((p) => p.line.id === "freight")?.usd ?? 0;
  const fobCost = landedCost - freightUSD;
  const fobCostPerCarton = totals.cartons > 0 ? fobCost / totals.cartons : 0;

  const markupBase = input.markupBase ?? "goods";
  const delivered = markupBase === "landed";

  // "landed": the margin sits on the whole cost, so the delivered price is the
  // marked-up per-carton cost outright and there is no base price to report.
  // "goods": the margin sits on everything but the carriage, which is added at
  // cost — that is what keeps CIF - FOB exactly equal to the freight.
  const fobPerCarton = delivered ? null : roundCents(markUp2(fobCostPerCarton, marginPct));
  const freightPerCarton = roundCents(totals.cartons > 0 ? freightUSD / totals.cartons : 0);
  const cifPerCarton = delivered
    ? roundCents(markUp2(costPerCarton, marginPct))
    : roundCents((fobPerCarton ?? 0) + freightPerCarton);

  const quotedPerCarton = cifPerCarton;
  const quotedTotal = roundCents(cifPerCarton * totals.cartons);
  const nw = nonNegative(input.cargo.nwPerCarton);
  // Whole dollars for display; the carton price above stays authoritative.
  const quotedPerMT = nw > 0 ? Math.round((cifPerCarton * 1000) / nw) : 0;
  // Two decimals, so a contract built from this lands within a cent of the
  // carton price the buyer agreed to.
  const contractPerMT = nw > 0 ? roundCents((cifPerCarton * 1000) / nw) : 0;

  const issues = collectIssues(input, totals, lines);

  return {
    lines,
    totals,
    landedCost,
    costPerMT,
    costPerCarton,
    marginPct,
    sellPerMT,
    freightUSD,
    fobCost,
    fobPerCarton,
    fobTotal: fobPerCarton === null ? null : roundCents(fobPerCarton * totals.cartons),
    freightPerCarton,
    cifPerCarton,
    quotedPerMT,
    contractPerMT,
    quotedPerCarton,
    quotedTotal,
    profit: roundCents(quotedTotal - landedCost),
    issues,
    ready: !issues.some((i) => i.level === "error"),
  };
}

/** Cents, so quoted figures are exact and per-carton × cartons reconciles. */
function roundCents(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Markup on a per-carton cost. Same formula as markUp, different unit. */
function markUp2(costPerCarton: number, marginPct: number): number {
  if (costPerCarton <= 0) return 0;
  return costPerCarton / (1 - clampMargin(marginPct) / 100);
}

/**
 * Reports WHICH problems a quote has, never their wording. Keeping this layer
 * language-free is what lets the same calculation explain itself in English or
 * Chinese; the panel resolves each code against the team dictionary.
 */
function collectIssues(input: QuoteInput, totals: CargoTotals, lines: PricedLine[]): QuoteIssue[] {
  const issues: QuoteIssue[] = [];
  const error = (code: QuoteIssue["code"], params?: QuoteIssue["params"]) =>
    issues.push({ level: "error", code, params });
  const warn = (code: QuoteIssue["code"], params?: QuoteIssue["params"]) =>
    issues.push({ level: "warning", code, params });

  if (!input.productSelected) error("noProduct");
  if (nonNegative(input.cargo.containers) < 1) error("containers");
  if (nonNegative(input.cargo.cartonsPerContainer) <= 0) error("cartons");
  if (nonNegative(input.cargo.nwPerCarton) <= 0) error("netWeight");
  // Printed on the quote, so a missing value would go out as "0.0 KG / carton".
  if (nonNegative(input.cargo.gwPerCarton) <= 0) error("grossWeight");
  // The quote names the sailing the price is tied to; freight moves between
  // sailings, so an offer without one is not actually shippable.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cargo.etd ?? "")) error("noEtd");

  const unconvertible = [...new Set(lines.filter((p) => p.usd === null).map((p) => p.line.currency))];
  if (unconvertible.length > 0) error("noFx", { currencies: unconvertible.join(", ") });

  const farm = lines.find((p) => p.line.id === "farm");
  if (farm && farm.line.amount <= 0) error("farmZero");

  const uncosted = lines
    .filter((p) => p.line.id !== "farm" && isFixedLine(p.line.id) && p.line.amount <= 0)
    .map((p) => p.line.label.toLowerCase());
  if (uncosted.length > 0) warn("uncosted", { labels: uncosted.join(", ") });

  if (clampMargin(input.marginPct) !== input.marginPct) warn("marginCapped", { max: MAX_MARGIN });

  // Gross below net is physically impossible — packaging only adds weight.
  const nw = nonNegative(input.cargo.nwPerCarton);
  const gw = nonNegative(input.cargo.gwPerCarton);
  if (nw > 0 && gw > 0 && gw < nw) warn("weightsSwapped");

  const unnamed = lines.filter((p) => !isFixedLine(p.line.id) && !p.line.label.trim() && p.line.amount > 0);
  if (unnamed.length > 0) warn("unnamedLine");

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
