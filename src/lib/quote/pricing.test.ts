import { describe, expect, it } from "vitest";
import { computeQuote } from "./pricing";
import { DEFAULT_FX } from "./defaults";
import { MARKETS } from "./markets";
import type { QuoteInput } from "./pricing";

/**
 * Characterization test. These numbers are what the calculator produced before
 * the market refactor; they are the contract with every quote already sent.
 * A change here is a regression until proven otherwise — never "update the
 * expected value to match".
 *
 * Fixture: 2 x 40'HC of ginger, Shekou -> Jeddah, at the shipped defaults.
 */
const GULF_FIXTURE: QuoteInput = {
  lines: [
    { id: "farm", label: "Farm price (EXW)", amount: 5.2, currency: "RMB", unit: "per_kg" },
    { id: "packing", label: "Packaging", amount: 1.8, currency: "RMB", unit: "per_carton" },
    { id: "freight", label: "Sea freight", amount: 2400, currency: "USD", unit: "per_container" },
    { id: "customs", label: "Customs & agent fee", amount: 350, currency: "USD", unit: "per_container" },
    { id: "inland", label: "Inland transport", amount: 600, currency: "USD", unit: "per_container" },
    { id: "bank", label: "Bank charges", amount: 45, currency: "USD", unit: "flat" },
  ],
  cargo: {
    productId: "p1",
    containers: 2,
    cartonsPerContainer: 11088,
    nwPerCarton: 2.3,
    gwPerCarton: 2.5,
    loadingPort: "SHEKOU PORT, CHINA",
    dischargePort: "JEDDAH PORT, SAUDI ARABIA",
    etd: "2026-09-15",
  },
  fx: DEFAULT_FX,
  marginPct: 20,
  productSelected: true,
};

describe("computeQuote — Gulf regression pin", () => {
  const q = computeQuote(GULF_FIXTURE);

  it("derives the shipment quantities", () => {
    expect(q.totals.cartons).toBe(22176);
    expect(q.totals.netKg).toBeCloseTo(51004.8, 6);
    expect(q.totals.grossKg).toBe(55440);
    expect(q.totals.qtyMTS).toBeCloseTo(51.0048, 6);
  });

  it("sums the landed cost", () => {
    expect(q.landedCost).toBeCloseTo(51951.18666666666, 8);
    expect(q.costPerMT).toBeCloseTo(1018.5548549678985, 8);
    expect(q.costPerCarton).toBeCloseTo(2.342676166426166, 10);
  });

  it("prices per carton in whole cents", () => {
    expect(q.fobPerCarton).toBe(2.66);
    expect(q.freightPerCarton).toBe(0.22);
    expect(q.cifPerCarton).toBe(2.88);
    expect(q.quotedPerCarton).toBe(2.88);
  });

  it("reconciles the totals against the carton price", () => {
    expect(q.freightUSD).toBe(4800);
    expect(q.fobCost).toBeCloseTo(47151.18666666666, 8);
    expect(q.fobTotal).toBe(58988.16);
    expect(q.quotedTotal).toBe(63866.88);
    expect(q.profit).toBe(11915.69);
  });

  it("derives the per-MT figures for display and contract", () => {
    expect(q.quotedPerMT).toBe(1252);
    expect(q.contractPerMT).toBe(1252.17);
    expect(q.sellPerMT).toBeCloseTo(1273.193568709873, 8);
  });

  it("is ready, with no issues", () => {
    expect(q.issues).toEqual([]);
    expect(q.ready).toBe(true);
  });

  // The property that lets a freight rise be restated without reopening the
  // margin. Task 3 must keep this true for the Gulf market.
  it("keeps CIF - FOB exactly equal to the freight per carton", () => {
    expect(q.fobPerCarton).not.toBeNull();
    expect(Math.round((q.cifPerCarton - q.fobPerCarton!) * 100) / 100).toBe(q.freightPerCarton);
  });
});

describe("computeQuote — markup base", () => {
  it("defaults to the Gulf rule when markupBase is 'goods'", () => {
    const q = computeQuote({ ...GULF_FIXTURE, markupBase: "goods" });
    expect(q.cifPerCarton).toBe(2.88);
    expect(q.fobPerCarton).toBe(2.66);
    expect(q.fobTotal).toBe(58988.16);
  });

  it("marks up the whole landed cost when markupBase is 'landed'", () => {
    const q = computeQuote({ ...GULF_FIXTURE, markupBase: "landed" });
    // costPerCarton 2.342676… / 0.8 = 2.9283… -> 2.93
    expect(q.cifPerCarton).toBe(2.93);
    expect(q.quotedPerCarton).toBe(2.93);
    expect(q.quotedTotal).toBe(64975.68);
    expect(q.quotedPerMT).toBe(1274);
    expect(q.contractPerMT).toBe(1273.91);
    expect(q.profit).toBe(13024.49);
  });

  it("returns no base price under 'landed', rather than a misleading one", () => {
    const q = computeQuote({ ...GULF_FIXTURE, markupBase: "landed" });
    expect(q.fobPerCarton).toBeNull();
    expect(q.fobTotal).toBeNull();
  });

  it("still reports the carriage under 'landed', for information", () => {
    const q = computeQuote({ ...GULF_FIXTURE, markupBase: "landed" });
    expect(q.freightUSD).toBe(4800);
    expect(q.freightPerCarton).toBe(0.22);
  });
});

/**
 * The team's Russian costing sheet, run through the calculator at zero margin.
 *
 * These figures deliberately DO NOT match the spreadsheet:
 *
 *  - Garlic and kiwi are far off because the sheet's Total column stops after
 *    freight on those two rows, silently dropping customs and the transit tax.
 *  - Ginger — the one row summed correctly — still lands three cents high,
 *    because the sheet converts the transit tax at 6.70 and everything else at
 *    6.77. The calculator holds one FX table per sheet, and the tax is entered
 *    in USD per MT so it never passes through FX at all.
 *
 * Matching the spreadsheet exactly would mean reproducing its bugs.
 */
const RU_FX = { RMB: 6.77, EUR: 0.92, SAR: 3.75, AED: 3.67, KWD: 0.31 };

function russianSheet(exwPerMT: number, inland: number, taxPerMT: number) {
  return MARKETS.russia.costLines().map((l) => {
    if (l.id === "farm") return { ...l, amount: exwPerMT };
    if (l.id === "inland") return { ...l, amount: inland };
    // The ~$500 transhipment stays inside the carriage for this fixture, as it
    // does in the source sheet. Splitting it out must not move the total.
    if (l.id === "freight") return { ...l, amount: 47570 };
    if (l.id === "customs") return { ...l, amount: 5000 };
    if (l.id === "transit") return { ...l, amount: taxPerMT };
    return l;
  });
}

describe.each([
  { name: "ginger", cartons: 1440, nw: 13.6, gw: 14.2, exw: 8300, inland: 18000, tax: 250, mt: 19.584, landed: 39329.8552, perBox: 27.3124 },
  { name: "garlic", cartons: 2900, nw: 10.0, gw: 10.5, exw: 8300, inland: 18000, tax: 240, mt: 29.0, landed: 52937.8434, perBox: 18.2544 },
  { name: "kiwi", cartons: 2400, nw: 9.0, gw: 9.5, exw: 6200, inland: 15000, tax: 150, mt: 21.6, landed: 33002.1861, perBox: 13.7509 },
])("Russian cost stack — $name", (c) => {
  const q = computeQuote({
    lines: russianSheet(c.exw, c.inland, c.tax),
    cargo: {
      productId: "p", containers: 1, cartonsPerContainer: c.cartons,
      nwPerCarton: c.nw, gwPerCarton: c.gw,
      loadingPort: "KHORGOS, KAZAKHSTAN",
      dischargePort: "FOOD CITY (MOSCOW), RUSSIA",
      etd: "2026-09-15",
    },
    fx: RU_FX,
    marginPct: 0,
    productSelected: true,
    markupBase: MARKETS.russia.markupBase,
  });

  it("lands on the corrected quantity and cost", () => {
    expect(q.totals.qtyMTS).toBeCloseTo(c.mt, 6);
    expect(q.landedCost).toBeCloseTo(c.landed, 3);
    expect(q.costPerCarton).toBeCloseTo(c.perBox, 4);
  });

  it("quotes no base price on a delivered market", () => {
    expect(q.fobPerCarton).toBeNull();
    expect(q.fobTotal).toBeNull();
  });

  it("raises no error — the stack is complete", () => {
    expect(q.issues.filter((i) => i.level === "error")).toEqual([]);
  });
});

it("is unmoved by splitting the transhipment fee out of the carriage", () => {
  const base = {
    productId: "p", containers: 1, cartonsPerContainer: 1440,
    nwPerCarton: 13.6, gwPerCarton: 14.2,
    loadingPort: "", dischargePort: "", etd: "2026-09-15",
  };
  const whole = computeQuote({
    lines: russianSheet(8300, 18000, 250),
    cargo: base, fx: RU_FX, marginPct: 0, productSelected: true, markupBase: "landed",
  });
  const split = computeQuote({
    lines: russianSheet(8300, 18000, 250).map((l) =>
      // $500 at 6.77 is RMB 3,385 — taken off the carriage, added back as USD.
      l.id === "freight" ? { ...l, amount: 47570 - 3385 } : l.id === "border" ? { ...l, amount: 500 } : l
    ),
    cargo: base, fx: RU_FX, marginPct: 0, productSelected: true, markupBase: "landed",
  });
  expect(split.landedCost).toBeCloseTo(whole.landedCost, 6);
});
