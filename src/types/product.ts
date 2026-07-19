export interface ProductProfile {
  id: string;
  name: string;
  /** Arabic display name (products.name_ar) — used in Arabic quotes/portal. */
  nameAr: string;
  hsCode: string;
  prefix: string;
  defaultNW: number;
  defaultGW: number;
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
