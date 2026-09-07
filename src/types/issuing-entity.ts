/**
 * The company whose name is on the document.
 *
 * NOT `Seller` in types/seller.ts — that is an upstream factory we buy from,
 * carrying the products it supplies and its lead time. This is who SELLS to the
 * buyer, which on a commercial invoice is us.
 *
 * The same company is written two ways because the documents already write it
 * two ways: the letterhead in title case across three blocks, the contract body
 * and signature in the uppercase house style those clauses use.
 */
export interface IssuingEntity {
  id: string;
  /** Letterhead, left block. */
  name: string;
  /** The Chinese line under it. Optional — a non-Chinese entity has none. */
  nameCn: string;
  /** Letterhead, right block: one entry per printed line. */
  addressLines: string[];
  /** Contract body and signature block. */
  legalName: string;
  legalAddress: string;
  tel: string;
  email: string;
  /** A path under /public, or a full URL from the entity-assets bucket. */
  logoUrl: string;
  stampUrl: string;
  /** Exactly one entity is the default; documents fall back to it. */
  isDefault: boolean;
  sortOrder: number;
}

export function emptyIssuingEntity(): IssuingEntity {
  return {
    id: "",
    name: "",
    nameCn: "",
    addressLines: [],
    legalName: "",
    legalAddress: "",
    tel: "",
    email: "",
    logoUrl: "",
    stampUrl: "",
    isDefault: false,
    sortOrder: 0,
  };
}
