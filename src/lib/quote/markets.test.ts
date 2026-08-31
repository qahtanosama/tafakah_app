import { describe, expect, it } from "vitest";
import { MARKETS, marketOf } from "./markets";
import { defaultCostLines } from "./defaults";

describe("market profiles", () => {
  it("leaves the Gulf profile identical to the shipped defaults", () => {
    // The Gulf profile must be a pure re-expression of current behaviour.
    expect(MARKETS.gulf.costLines()).toEqual(defaultCostLines());
    expect(MARKETS.gulf.usdExpected).toEqual(["freight", "bank"]);
    expect(MARKETS.gulf.markupBase).toBe("goods");
    expect(MARKETS.gulf.priceShape).toBe("two");
    expect(MARKETS.gulf.terms).toEqual({ base: "FOB", delivered: "CIF" });
    expect(MARKETS.gulf.langs).toEqual(["en", "ar"]);
  });

  it("describes the Russian overland route", () => {
    const ru = MARKETS.russia;
    expect(ru.mode).toBe("overland");
    expect(ru.terms).toEqual({ base: "FCA", delivered: "DAP" });
    expect(ru.destinations).toBe("overland");
    expect(ru.priceShape).toBe("delivered");
    expect(ru.markupBase).toBe("landed");
    expect(ru.langs).toEqual(["ru", "en"]);
  });

  it("costs the Russian stack in journey order", () => {
    expect(MARKETS.russia.costLines().map((l) => l.id)).toEqual([
      "farm", "packing", "inland", "border", "freight", "customs", "transit", "bank",
    ]);
  });

  it("quotes Russian freight in RMB and does not warn about it", () => {
    const freight = MARKETS.russia.costLines().find((l) => l.id === "freight");
    expect(freight?.currency).toBe("RMB");
    expect(MARKETS.russia.usdExpected).not.toContain("freight");
    expect(MARKETS.russia.usdExpected).toEqual(["border", "transit", "bank"]);
  });

  it("costs the Russian farm price per MT, not per KG", () => {
    expect(MARKETS.russia.costLines().find((l) => l.id === "farm")?.unit).toBe("per_mt");
  });

  it("falls back to Gulf for an unknown or missing market", () => {
    expect(marketOf(undefined).id).toBe("gulf");
    expect(marketOf("atlantis").id).toBe("gulf");
    expect(marketOf("russia").id).toBe("russia");
  });
});
