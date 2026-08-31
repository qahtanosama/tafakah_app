/**
 * A product's pack format in one market, overriding the row's default columns.
 * Every field is optional and falls through independently — a market that only
 * changes the box count keeps the product's weights.
 */
export interface MarketPack {
  /** Boxes/bags that fill one container in this market. */
  cartons?: number;
  /** Net kg per unit. */
  nw?: number;
  /** Gross kg per unit. */
  gw?: number;
  packUnit?: string;
  packUnitAr?: string;
  /**
   * Published per-ton transit tax for this commodity in this market, in USD.
   * Seeds the `transit` cost line. Russia only; 0 or absent elsewhere.
   */
  transitTaxPerMT?: number;
}

export interface ProductProfile {
  id: string;
  name: string;
  /** Arabic display name (products.name_ar) — used in Arabic quotes/portal. */
  nameAr: string;
  hsCode: string;
  prefix: string;
  defaultNW: number;
  defaultGW: number;
  /**
   * Boxes/bags that fill one container for this pack format (products.default_cartons).
   * 0 means not set — the Quote Calculator falls back to its generic default.
   */
  defaultCartons: number;
  /**
   * Singular noun for one unit of this pack format — "carton", "mesh bag".
   * Quotes pluralise the English with a trailing "s"; Arabic takes the singular
   * after any number above ten, which is the only range these counts hit.
   */
  packUnit: string;
  packUnitAr: string;
  defaultPriceMT: number;
  /**
   * Producing town/region, e.g. "Anqiu, Shandong". The FCA named place on an
   * overland quote — the truck loads at the packhouse, so that is where our
   * obligation ends. Sea quotes name the loading port instead and ignore this.
   * Free text: these are farm towns maintained per product, not a fixed list.
   */
  origin: string;
  containerType: string;
  notes: string;
  /**
   * Pack format per market, keyed by market id (products.market_packs). The
   * columns above stay the DEFAULT pack, which is the Gulf one.
   */
  marketPacks: Record<string, MarketPack>;
}

export interface PriceHistoryEntry {
  date: string;
  priceMT: number;
  buyer: string;
  contractNo: string;
  qtyMTS: number;
}
