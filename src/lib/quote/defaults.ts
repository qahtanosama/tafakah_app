import type { CostLine, CostUnit, Currency, FxRates } from "@/types/quote";
import { FIXED_COST_IDS } from "@/types/quote";

/**
 * The only container the team ships. ~99% of shipments are 40' high-cube, so
 * the calculator states it rather than asking. Single source of truth: add a
 * picker back on top of this constant if a second type ever becomes routine.
 */
export const CONTAINER_TYPE = "40'HC";

export const CURRENCIES: Currency[] = ["USD", "RMB", "EUR", "SAR", "AED", "KWD"];

/** 1 USD = <rate>. Editable in the FX panel and persisted per browser. */
export const DEFAULT_FX: FxRates = { RMB: 6.75, EUR: 0.92, SAR: 3.75, AED: 3.67, KWD: 0.31 };

/** Order matters — this is the dropdown order on every cost line. */
export const UNITS: { value: CostUnit; label: string }[] = [
  { value: "per_kg", label: "per KG" },
  { value: "per_carton", label: "per carton" },
  { value: "per_container", label: "per container" },
  { value: "per_mt", label: "per MT" },
  { value: "flat", label: "per shipment" },
];

/** Typical cartons in a 40'HC of fresh produce — a starting point, always editable. */
export const DEFAULT_CARTONS = 9700;

export const DEFAULT_MARGIN = 20;

/** Range offered by the margin control. Both the slider and the number box use
 *  it, so the two can never show different values. */
export const MARGIN_MIN = 0;
export const MARGIN_MAX = 50;

/**
 * Hard ceiling inside the pricing math. The markup formula cost/(1 - m)
 * diverges as m -> 100%, so a stray 100 would otherwise produce a $0 quote.
 * The UI clamps to MARGIN_MAX well below this; this guards restored or
 * programmatic values.
 */
export const MAX_MARGIN = 95;

export const SCENARIO_MARGINS = [10, 15, 20, 25, 30];

/**
 * The six standing cost lines. Amounts start at 0 deliberately: a pre-filled
 * fee nobody checked is more dangerous than an obviously empty one, because it
 * quietly lands in a real quote. Once entered they persist per browser, so the
 * blank sheet is a first-run cost only.
 *
 * Units are the common case, not a constraint — every line's currency and unit
 * stay editable, which is what lets a per-container customs fee actually scale
 * with the container count.
 */
export function defaultCostLines(): CostLine[] {
  return [
    { id: "farm", label: "Farm price (EXW)", amount: 0, currency: "RMB", unit: "per_kg" },
    { id: "packing", label: "Packaging", amount: 0, currency: "RMB", unit: "per_carton" },
    // Freight and bank charges are invoiced to us in USD; the sheet warns if
    // either is switched to another currency, because entering a USD figure
    // under RMB would divide it by the exchange rate and understate the cost.
    { id: "freight", label: "Sea freight", amount: 0, currency: "USD", unit: "per_container" },
    { id: "customs", label: "Customs & agent fee", amount: 0, currency: "USD", unit: "per_container" },
    { id: "inland", label: "Inland transport", amount: 0, currency: "USD", unit: "per_container" },
    { id: "bank", label: "Bank charges", amount: 0, currency: "USD", unit: "flat" },
  ];
}

/**
 * A blank extra line. Defaults to per-container because ad-hoc export costs
 * (fumigation, genset, port storage) are almost always charged per box.
 */
export function newCostLine(): CostLine {
  return {
    id: `x-${crypto.randomUUID().slice(0, 8)}`,
    label: "",
    amount: 0,
    currency: "USD",
    unit: "per_container",
  };
}

export function isFixedLine(id: string): boolean {
  return (FIXED_COST_IDS as readonly string[]).includes(id);
}

/**
 * Lines the forwarder and the bank bill us in USD. Entering one of these in RMB
 * silently divides it by the FX rate, which understates the cost and quietly
 * inflates the margin — so the sheet flags a non-USD currency on these two
 * rather than trusting it.
 */
export const USD_EXPECTED_LINES: readonly string[] = ["freight", "bank"];
