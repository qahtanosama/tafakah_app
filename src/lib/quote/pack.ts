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
