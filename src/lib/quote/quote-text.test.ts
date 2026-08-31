import { describe, expect, it } from "vitest";
import { buildQuoteText, formatEtd, quoteTerms } from "./quote-text";
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
    expect(quoteTerms(MARKETS.russia, "Anqiu, Shandong", "FOOD CITY (MOSCOW), RUSSIA"))
      .toEqual({ base: "FCA Khorgos", delivered: "DAP Food City (Moscow)" });
  });

  it("hands over at the border whatever the goods' origin is", () => {
    // The base price is collected at Khorgos; Anqiu and Jining are provenance.
    // "FCA Anqiu" would offer a handover nobody is actually offering.
    for (const origin of ["Anqiu, Shandong", "Jining, Shandong", "Shaanxi", ""]) {
      expect(quoteTerms(MARKETS.russia, origin, "MOSCOW, RUSSIA").base).toBe("FCA Khorgos");
    }
  });

  it("still names the loading port on a sea market", () => {
    // The Gulf has no basePlace, so the base term names where it loads.
    expect(quoteTerms(MARKETS.gulf, "QINGDAO PORT, CHINA", "").base).toBe("FOB Qingdao");
    expect(quoteTerms(MARKETS.gulf, "", "")).toEqual({ base: "FOB", delivered: "CIF" });
  });
});


const RU_QUOTE = {
  totals: { cartons: 1440, netKg: 19584, grossKg: 20448, qtyMTS: 19.584 },
  fobPerCarton: 29.26,
  fobTotal: 42134.4,
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
    origin: "Anqiu, Shandong",
    quote: RU_QUOTE,
  });

  it("offers both the border price and the delivered price", () => {
    expect(text).toContain("*FCA Khorgos*");
    expect(text).toContain("*DAP Food City (Moscow)*");
    expect(text).not.toContain("FOB");
    expect(text).not.toContain("CIF");
  });

  it("names where the goods are grown, as provenance", () => {
    expect(text).toContain("Происхождение: Anqiu, Shandong");
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



describe("formatEtd", () => {
  it("keeps the abbreviated English month by default", () => {
    expect(formatEtd("2026-09-14")).toBe("14 Sept 2026");
  });

  it("formats a Russian quote's date in Russian", () => {
    // An English month name mid-sentence in Cyrillic reads as machine output.
    expect(formatEtd("2026-09-14", "ru")).toMatch(/сент/);
    expect(formatEtd("2026-09-14", "ru")).not.toMatch(/Sept/);
  });

  it("survives an empty or unparseable date", () => {
    expect(formatEtd("")).toBe("—");
    expect(formatEtd("not-a-date", "ru")).toBe("not-a-date");
  });
});

describe("payment terms on the quote", () => {
  const base = {
    market: MARKETS.russia,
    productName: "Fresh Ginger",
    containers: 1,
    cartonsPerContainer: 1680,
    gwPerCarton: 14.2,
    loadingPort: "Anqiu, Shandong",
    dischargePort: "FOOD CITY (MOSCOW), RUSSIA",
    etd: "2026-09-14",
    packUnit: "carton",
    quote: { ...RU_QUOTE, fobPerCarton: 23.81, fobTotal: 40000 } as unknown as Quote,
  };

  it("states how the buyer pays, in the quote's language", () => {
    const text = buildQuoteText({
      ...base, lang: "ru",
      paymentTerms: "30% предоплата, 70% после погрузки контейнера",
    });
    expect(text).toContain("Оплата: 30% предоплата, 70% после погрузки контейнера");
  });

  it("drops the sea-freight caveat from a Russian offer", () => {
    const text = buildQuoteText({ ...base, lang: "ru", paymentTerms: "x" });
    expect(text).not.toMatch(/морск|Стоимость перевозки меняется/);
    // The offer still says how long it stands.
    expect(text).toMatch(/Предложение действительно/);
  });

  it("keeps the sea-freight caveat on a Gulf offer", () => {
    const text = buildQuoteText({
      ...base, market: MARKETS.gulf, lang: "en",
      loadingPort: "SHEKOU PORT, CHINA", dischargePort: "JEDDAH PORT, SAUDI ARABIA",
      paymentTerms: "50% advance, 50% before arrival of the goods",
    });
    expect(text).toContain("Sea freight is unstable");
    expect(text).toContain("Payment: 50% advance, 50% before arrival of the goods");
  });

  it("omits the line entirely when no terms are given", () => {
    const text = buildQuoteText({ ...base, lang: "ru" });
    expect(text).not.toMatch(/Оплата:/);
  });
});
