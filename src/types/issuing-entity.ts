import type { BankDetails } from "@/types/sales-contract";

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
/**
 * Where a buyer pays this company.
 *
 * Deliberately the same shape as BankDetails in types/sales-contract.ts — that
 * is what the contract already prints, so picking an entity can set the
 * contract's bank block wholesale with no mapping.
 */
export type EntityBankDetails = BankDetails;

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
  /**
   * Where the buyer pays. Per entity, not global: each company banks under its
   * own account, and invoicing as one company while asking for payment into
   * another's account is the kind of error that costs a shipment.
   */
  bank: EntityBankDetails;
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
    bank: { swift: "", beneficiary: "", account: "", bank: "", bankAddress: "", postCode: "" },
    logoUrl: "",
    stampUrl: "",
    isDefault: false,
    sortOrder: 0,
  };
}
