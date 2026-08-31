import { describe, expect, it } from "vitest";
import { mergePack, packFor, withPack } from "./pack";
import type { ProductProfile } from "@/types/product";

const GINGER: ProductProfile = {
  id: "p1",
  name: "Fresh Ginger",
  nameAr: "زنجبيل طازج",
  hsCode: "0910.1100",
  prefix: "GG",
  defaultNW: 2.3,
  defaultGW: 2.5,
  defaultCartons: 11088,
  packUnit: "carton",
  packUnitAr: "كرتون",
  defaultPriceMT: 0,
  origin: "Anqiu, Shandong",
  containerType: "40'HC",
  notes: "",
  marketPacks: {
    russia: { cartons: 1440, nw: 13.6, gw: 14.2, packUnit: "carton", transitTaxPerMT: 250 },
  },
};

describe("packFor", () => {
  it("uses the product's own columns for the Gulf", () => {
    expect(packFor(GINGER, "gulf")).toEqual({
      cartons: 11088, nw: 2.3, gw: 2.5,
      packUnit: "carton", packUnitAr: "كرتون", transitTaxPerMT: 0,
    });
  });

  it("uses the market pack for Russia", () => {
    expect(packFor(GINGER, "russia")).toEqual({
      cartons: 1440, nw: 13.6, gw: 14.2,
      packUnit: "carton", packUnitAr: "كرتون", transitTaxPerMT: 250,
    });
  });

  it("falls through per field, not all-or-nothing", () => {
    // A market pack that only overrides the box count keeps the product's weights.
    const partial = { ...GINGER, marketPacks: { russia: { cartons: 1440 } } };
    expect(packFor(partial, "russia")).toMatchObject({ cartons: 1440, nw: 2.3, gw: 2.5 });
  });

  it("treats 0 as unset, because the columns are NOT NULL DEFAULT 0", () => {
    const partial = { ...GINGER, marketPacks: { russia: { cartons: 0, nw: 13.6 } } };
    expect(packFor(partial, "russia").cartons).toBe(11088);
  });

  it("falls back to the generic default when the product has no box count", () => {
    const bare = { ...GINGER, defaultCartons: 0, marketPacks: {} };
    expect(packFor(bare, "gulf").cartons).toBe(9700);
  });

  it("survives no product at all", () => {
    expect(packFor(undefined, "russia").cartons).toBe(9700);
  });
});

describe("withPack", () => {
  it("writes the Gulf pack to the product's own columns", () => {
    const next = withPack(GINGER, "gulf", { cartons: 11500, nw: 2.4 });
    expect(next.defaultCartons).toBe(11500);
    expect(next.defaultNW).toBe(2.4);
    expect(next.defaultGW).toBe(2.5); // untouched
    // The Gulf IS the default pack — nothing lands in market_packs.
    expect(next.marketPacks.gulf).toBeUndefined();
  });

  it("writes a non-default market into its own pack", () => {
    const next = withPack(GINGER, "russia", { cartons: 1500 });
    expect(next.marketPacks.russia).toEqual({
      cartons: 1500, nw: 13.6, gw: 14.2, packUnit: "carton", transitTaxPerMT: 250,
    });
    // The Gulf pack is untouched.
    expect(next.defaultCartons).toBe(11088);
    expect(next.defaultNW).toBe(2.3);
  });

  it("creates the market pack when the product has none", () => {
    const bare = { ...GINGER, marketPacks: {} };
    expect(withPack(bare, "russia", { nw: 10 }).marketPacks.russia).toEqual({ nw: 10 });
  });

  it("ignores zero and negative values rather than storing 'unset'", () => {
    const next = withPack(GINGER, "russia", { cartons: 0, nw: -1, gw: 15 });
    expect(next.marketPacks.russia).toMatchObject({ cartons: 1440, nw: 13.6, gw: 15 });
  });

  it("returns the same object when nothing actually changed", () => {
    expect(withPack(GINGER, "russia", { cartons: 1440, nw: 13.6 })).toBe(GINGER);
    expect(withPack(GINGER, "gulf", { cartons: 11088 })).toBe(GINGER);
  });
});

describe("mergePack", () => {
  it("carries fields the calculator cannot edit", () => {
    const current = { cartons: 1440, nw: 13.6, gw: 14.2, packUnit: "carton", transitTaxPerMT: 250 };
    expect(mergePack(current, { cartons: 1680, nw: 13.5 })).toEqual({
      cartons: 1680, nw: 13.5, gw: 14.2, packUnit: "carton", transitTaxPerMT: 250,
    });
  });

  it("reports null when nothing moved, so the caller can skip the write", () => {
    const current = { cartons: 1440, nw: 13.6, gw: 14.2, transitTaxPerMT: 250 };
    expect(mergePack(current, { cartons: 1440 })).toBeNull();
    expect(mergePack(current, {})).toBeNull();
  });
});
