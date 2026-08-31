/**
 * What differs between the markets we sell into.
 *
 * The Gulf ships by sea on FOB/CIF terms to a named port. Russia goes overland
 * — trucked to Khorgos, transhipped across the gauge break, then carried
 * through Kazakhstan — on FCA/DAP terms to a named inland place. That changes
 * the incoterms, the destination vocabulary, the date on the quote, the cost
 * lines, which of them arrive in USD, and the language the offer goes out in.
 *
 * Kept in code rather than a table because a profile carries BEHAVIOUR, not
 * just values: which list the destination picker offers, what the margin is
 * applied to, which caveat sentence prints. `PORTS`, `CURRENCIES`, `UNITS` and
 * `CONTAINER_TYPE` all live as code constants for the same reason.
 *
 * The `gulf` profile is a pure re-expression of what the calculator did before
 * markets existed. It is pinned by pricing.test.ts and markets.test.ts; if you
 * find yourself editing it, you are changing quotes that have already gone out.
 */

import type { CostLine, MarketId } from "@/types/quote";
import type { QuoteLang } from "./storage";
import { defaultCostLines } from "./defaults";

export interface Market {
  id: MarketId;
  /** Key into the team dictionary's `calc` namespace — never a literal. */
  labelKey: "marketGulf" | "marketRussia";
  mode: "sea" | "overland";
  /** The pair this market quotes on: a base price and a delivered price. */
  terms: { base: string; delivered: string };
  /** Which list the destination picker offers. */
  destinations: "ports" | "overland";
  /** Whether the quote prints both prices or only the delivered one. */
  priceShape: "two" | "delivered";
  /**
   * Where the base price is handed over, when that is NOT where the goods
   * originate. A sea quote hands over at the loading port, so this is unset and
   * the base term names that port. The Russian route hands over at the Khorgos
   * border — the buyer can either collect there or take it delivered — while
   * the goods themselves come from Anqiu or Jining, which is provenance, not an
   * incoterm place.
   */
  basePlace?: string;
  /**
   * Cost lines that make up the leg BETWEEN the base price and the delivered
   * price. They are passed through at cost, so delivered − base is exactly
   * their sum and a rate rise can be restated without reopening the margin.
   *
   * The Gulf splits on sea freight alone. The Russian route splits at Khorgos,
   * so the Kazakh transit tax belongs here too — it is levied beyond the border,
   * on the onward leg, and a buyer collecting at Khorgos never pays it.
   */
  carriageLines: readonly string[];
  /**
   * What the margin is applied to. "goods" marks up everything except sea
   * freight and passes the freight through at cost, which is what makes
   * CIF - FOB exactly the freight. "landed" marks up the whole landed cost,
   * which is what makes a one-price market's 20% actually mean 20%.
   */
  markupBase: "goods" | "landed";
  /**
   * Route a fresh quote starts on, as stored port/place values. Absent on the
   * Gulf, which takes its default from the contract defaults (see
   * `defaultRoute()` in quote-text.ts) — kept there rather than here to avoid a
   * cycle, since quote-text imports this module.
   */
  defaultRoute?: { loadingPort: string; dischargePort: string };
  /** Offered quote languages, most likely first. */
  langs: QuoteLang[];
  /** The standing cost lines, in the order the team thinks about them. */
  costLines: () => CostLine[];
  /**
   * Lines this market's suppliers invoice in USD. Entering one in RMB divides
   * it by the FX rate and understates the cost, so the sheet flags it. Russian
   * freight is genuinely quoted in RMB and is deliberately absent here.
   */
  usdExpected: readonly string[];
}

export const DEFAULT_MARKET: MarketId = "gulf";

/**
 * The Russian stack, in journey order: farm gate -> packed -> trucked to the
 * border -> transhipped -> carried through Kazakhstan -> cleared -> taxed in
 * transit -> paid.
 *
 * Amounts start at 0 for the same reason the Gulf lines do: a pre-filled fee
 * nobody checked is more dangerous than an obviously empty one. The transit tax
 * is the exception — it is seeded per product from `market_packs`, because it
 * is a published per-ton rate that differs by commodity, not a negotiated cost.
 */
function russianCostLines(): CostLine[] {
  return [
    // Quoted per ton in Russia, unlike the Gulf's per-kg farm price.
    { id: "farm", label: "Farm price (EXW)", amount: 0, currency: "RMB", unit: "per_mt" },
    { id: "packing", label: "Packaging", amount: 0, currency: "RMB", unit: "per_carton" },
    { id: "inland", label: "Inland to Khorgos", amount: 0, currency: "RMB", unit: "per_container" },
    // Split out of the carriage on purpose: the transhipment fee is fixed while
    // the leg beyond it moves, and they go stale at different rates.
    { id: "border", label: "Border transhipment", amount: 0, currency: "USD", unit: "per_container" },
    { id: "freight", label: "Freight Khorgos - destination", amount: 0, currency: "RMB", unit: "per_container" },
    { id: "customs", label: "Customs & agent fee", amount: 0, currency: "RMB", unit: "per_container" },
    { id: "transit", label: "Kazakhstan transit tax", amount: 0, currency: "USD", unit: "per_mt" },
    { id: "bank", label: "Bank charges", amount: 0, currency: "USD", unit: "flat" },
  ];
}

export const MARKETS: Record<MarketId, Market> = {
  gulf: {
    id: "gulf",
    labelKey: "marketGulf",
    mode: "sea",
    terms: { base: "FOB", delivered: "CIF" },
    destinations: "ports",
    priceShape: "two",
    carriageLines: ["freight"],
    markupBase: "goods",
    langs: ["en", "ar"],
    costLines: defaultCostLines,
    usdExpected: ["freight", "bank"],
  },
  russia: {
    id: "russia",
    labelKey: "marketRussia",
    mode: "overland",
    terms: { base: "FCA", delivered: "DAP" },
    destinations: "overland",
    // Two prices: the buyer either collects at Khorgos or takes it delivered to
    // Moscow, and the offer puts both in front of him.
    priceShape: "two",
    basePlace: "KHORGOS, KAZAKHSTAN",
    carriageLines: ["freight", "transit"],
    markupBase: "goods",
    // Values as OVERLAND_PLACES stores them — see formatPortValue. The loading
    // place is only a fallback: a product with an origin recorded uses that.
    defaultRoute: { loadingPort: "KHORGOS, KAZAKHSTAN", dischargePort: "FOOD CITY (MOSCOW), RUSSIA" },
    langs: ["ru", "en"],
    costLines: russianCostLines,
    usdExpected: ["border", "transit", "bank"],
  },
};

export const MARKET_IDS = Object.keys(MARKETS) as MarketId[];

/** Any unrecognised value resolves to Gulf — the market every old row is in. */
export function marketOf(id: string | undefined | null): Market {
  return MARKETS[(id ?? "") as MarketId] ?? MARKETS[DEFAULT_MARKET];
}
