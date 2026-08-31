import { describe, expect, it } from "vitest";
import { computeQuote } from "./pricing";
import { DEFAULT_FX } from "./defaults";
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
