/**
 * Which pack format a product has in a given market.
 *
 * Resolution runs per field, not per object: a market pack that only overrides
 * the box count keeps the product's carton weights. `set()` treats 0 as "not
 * filled in" because the underlying columns are NOT NULL DEFAULT 0 — using `??`
 * would let an unset 0 beat a real value.
 */

import type { MarketPack, ProductProfile } from "@/types/product";
import type { MarketId } from "@/types/quote";
import { DEFAULT_CARTONS } from "./defaults";
import { DEFAULT_MARKET } from "./markets";

export interface ResolvedPack {
  cartons: number;
  nw: number;
  gw: number;
  packUnit: string;
  packUnitAr: string;
  transitTaxPerMT: number;
}

/** A positive number, or undefined when the field is simply not filled in. */
function set(n: number | undefined): number | undefined {
  return typeof n === "number" && n > 0 ? n : undefined;
}

function str(s: string | undefined): string | undefined {
  return s?.trim() ? s : undefined;
}

export function packFor(product: ProductProfile | undefined, market: MarketId): ResolvedPack {
  const pack: MarketPack = product?.marketPacks?.[market] ?? {};
  return {
    cartons: set(pack.cartons) ?? set(product?.defaultCartons) ?? DEFAULT_CARTONS,
    nw: set(pack.nw) ?? set(product?.defaultNW) ?? 0,
    gw: set(pack.gw) ?? set(product?.defaultGW) ?? 0,
    packUnit: str(pack.packUnit) ?? str(product?.packUnit) ?? "carton",
    packUnitAr: str(pack.packUnitAr) ?? str(product?.packUnitAr) ?? "كرتون",
    transitTaxPerMT: set(pack.transitTaxPerMT) ?? 0,
  };
}

/** The three figures the calculator lets you type on the shipment bar. */
export interface PackPatch {
  cartons?: number;
  nw?: number;
  gw?: number;
}

/**
 * A copy of `product` with this market's pack updated — the write-back for
 * packaging typed on the calculator, so it is there again next session and on
 * the Products page rather than being lost with the tab.
 *
 * The default market writes the product's own columns, because those ARE its
 * pack; any other market writes its entry in `market_packs`. That keeps one
 * source of truth per market and avoids the stale-snapshot problem that comes
 * from letting a saved cost sheet outrank product data.
 *
 * Zero and negative values are ignored rather than stored: the columns are
 * NOT NULL DEFAULT 0, so writing 0 would mean "unset", not "zero boxes" —
 * which is how a half-typed number would wipe a good value.
 *
 * Returns the SAME object when nothing changed, so a caller can skip the write.
 */
export function withPack(
  product: ProductProfile,
  market: MarketId,
  patch: PackPatch
): ProductProfile {
  const cartons = set(patch.cartons);
  const nw = set(patch.nw);
  const gw = set(patch.gw);

  if (market === DEFAULT_MARKET) {
    const next = {
      ...product,
      defaultCartons: cartons ?? product.defaultCartons,
      defaultNW: nw ?? product.defaultNW,
      defaultGW: gw ?? product.defaultGW,
    };
    return next.defaultCartons === product.defaultCartons &&
      next.defaultNW === product.defaultNW &&
      next.defaultGW === product.defaultGW
      ? product
      : next;
  }

  const current: MarketPack = product.marketPacks?.[market] ?? {};
  const merged: MarketPack = {
    ...current,
    ...(cartons === undefined ? {} : { cartons }),
    ...(nw === undefined ? {} : { nw }),
    ...(gw === undefined ? {} : { gw }),
  };
  const unchanged =
    merged.cartons === current.cartons && merged.nw === current.nw && merged.gw === current.gw;
  return unchanged
    ? product
    : { ...product, marketPacks: { ...product.marketPacks, [market]: merged } };
}
