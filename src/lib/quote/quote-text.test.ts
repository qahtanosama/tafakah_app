import { describe, expect, it } from "vitest";
import { quoteTerms } from "./quote-text";
import { MARKETS } from "./markets";

describe("quoteTerms", () => {
  it("shortens sea ports the way an offer writes them", () => {
    expect(quoteTerms(MARKETS.gulf, "SHEKOU PORT, CHINA", "JEDDAH PORT, SAUDI ARABIA"))
      .toEqual({ base: "FOB Shekou", delivered: "CIF Jeddah" });
  });

  it("keeps a berth qualifier that disambiguates the port", () => {
    expect(quoteTerms(MARKETS.gulf, "", "KHALIFA PORT (ABU DHABI), UAE").delivered)
      .toBe("CIF Khalifa Port");
  });

  it("uses overland place names verbatim", () => {
    // portShortName() would strip the parenthetical and leave "DAP Food City",
    // losing the city the buyer is actually being quoted to.
    expect(quoteTerms(MARKETS.russia, "KHORGOS, KAZAKHSTAN", "FOOD CITY (MOSCOW), RUSSIA"))
      .toEqual({ base: "FCA Khorgos", delivered: "DAP Food City (Moscow)" });
  });

  it("falls back to the bare term when no place is chosen", () => {
    expect(quoteTerms(MARKETS.russia, "", "")).toEqual({ base: "FCA", delivered: "DAP" });
  });
});
