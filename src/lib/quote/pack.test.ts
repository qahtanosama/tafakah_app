import { describe, expect, it } from "vitest";
import { packFor } from "./pack";
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
