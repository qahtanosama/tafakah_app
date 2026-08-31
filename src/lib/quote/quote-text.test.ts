import { describe, expect, it } from "vitest";
import { buildQuoteText, quoteTerms } from "./quote-text";
import type { Quote } from "@/types/quote";
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


const RU_QUOTE = {
  totals: { cartons: 1440, netKg: 19584, grossKg: 20448, qtyMTS: 19.584 },
  fobPerCarton: null,
  fobTotal: null,
  freightPerCarton: 4.88,
  cifPerCarton: 34.14,
  quotedPerCarton: 34.14,
  quotedPerMT: 2510,
  quotedTotal: 49161.6,
} as unknown as Quote;

describe("buildQuoteText — Russian", () => {
  const text = buildQuoteText({
    lang: "ru",
    market: MARKETS.russia,
    productName: "Fresh Ginger",
    containers: 1,
    cartonsPerContainer: 1440,
    gwPerCarton: 14.2,
    loadingPort: "KHORGOS, KAZAKHSTAN",
    dischargePort: "FOOD CITY (MOSCOW), RUSSIA",
    etd: "2026-09-15",
    packUnit: "carton",
    quote: RU_QUOTE,
  });

  it("prints one delivered price, not two", () => {
    expect(text).toContain("*DAP Food City (Moscow)*");
    expect(text).not.toContain("FCA");
    expect(text).not.toContain("FOB");
    expect(text).not.toContain("CIF");
  });

  it("restates the price per ton", () => {
    expect(text).toContain("$2,510");
  });

  it("carries no sea vocabulary", () => {
    expect(text).not.toMatch(/sea|vessel|sailing|ETD/i);
    expect(text).not.toMatch(/морск|судн/i);
  });

  it("keeps the product emoji and the brand", () => {
    expect(text).toContain("🫚");
    expect(text).toContain("NAWA FRESH");
  });

  it("never leaks Chinese into buyer output", () => {
    expect(text).not.toMatch(/[一-鿿]/);
  });
});

describe("buildQuoteText — Gulf is unchanged", () => {
  it("still prints both prices in English", () => {
    const text = buildQuoteText({
      lang: "en",
      market: MARKETS.gulf,
      productName: "Fresh Ginger",
      containers: 2,
      cartonsPerContainer: 11088,
      gwPerCarton: 2.5,
      loadingPort: "SHEKOU PORT, CHINA",
      dischargePort: "JEDDAH PORT, SAUDI ARABIA",
      etd: "2026-09-15",
      packUnit: "carton",
      quote: { ...RU_QUOTE, fobPerCarton: 2.66, fobTotal: 58988.16 } as unknown as Quote,
    });
    expect(text).toContain("*FOB Shekou*");
    expect(text).toContain("*CIF Jeddah*");
    expect(text).toContain("ETD:");
  });
});

describe("quoteTerms — overland origin from the product", () => {
  it("names the producing town as the FCA place", () => {
    expect(quoteTerms(MARKETS.russia, "Anqiu, Shandong", "FOOD CITY (MOSCOW), RUSSIA"))
      .toEqual({ base: "FCA Anqiu", delivered: "DAP Food City (Moscow)" });
  });

  it("drops the province — the incoterm names a place, not a region pair", () => {
    expect(quoteTerms(MARKETS.russia, "Jining, Shandong", "").base).toBe("FCA Jining");
  });

  it("handles a bare province for a product recorded without a town", () => {
    expect(quoteTerms(MARKETS.russia, "Shaanxi", "").base).toBe("FCA Shaanxi");
  });
});
