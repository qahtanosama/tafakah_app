import { describe, expect, it } from "vitest";
import { OVERLAND_PLACES, placesFor } from "./places";
import { MARKETS } from "@/lib/quote/markets";
import { PORTS } from "./ports";

describe("overland places", () => {
  it("offers ports to a sea market and inland places to an overland one", () => {
    expect(placesFor(MARKETS.gulf)).toBe(PORTS);
    expect(placesFor(MARKETS.russia)).toBe(OVERLAND_PLACES);
  });

  it("names the border crossing and the Moscow wholesale market", () => {
    const names = OVERLAND_PLACES.map((p) => p.name);
    expect(names).toContain("Khorgos");
    expect(names).toContain("Food City (Moscow)");
    expect(names).toContain("Moscow");
  });

  it("keeps the ports list free of inland places", () => {
    // MasterDataForm renders PORTS; a road destination has no business there.
    expect(PORTS.some((p) => p.name === "Food City (Moscow)")).toBe(false);
  });
});
