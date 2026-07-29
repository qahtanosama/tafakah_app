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
  containerType: string;
  notes: string;
}

export interface PriceHistoryEntry {
  date: string;
  priceMT: number;
  buyer: string;
  contractNo: string;
  qtyMTS: number;
}
