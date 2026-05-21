export interface LineItem {
  id: string;
  product: Product | "";
  hsCode: string;
  nwPerCarton: number | "";
  gwPerCarton: number | "";
  cartons: number | "";
  qtyMTS: number;
  pricePerMT: number | "";
  pricePerCarton: number;
}

export type Product = "Fresh Ginger" | "Fresh Garlic" | "Fresh Kiwi" | "Fresh Apple";

export interface SellerInfo {
  company: string;
  address: string;
  tel: string;
  email: string;
  stamp?: string; // base64 data URL for company stamp image
}

export interface BuyerInfo {
  /**
   * Optional UUID linking back to the buyers row this contract is for.
   * When present and a valid UUID, the submit/sync pipeline uses this directly
   * instead of name-matching (which previously created duplicate buyer rows).
   */
  id?: string;
  company: string;
  address: string;
  additionalNumber: string;
  cityPostal: string;
  email: string;
  ccEmail: string;
  country?: string;
}

export interface ShippingInfo {
  loadingPort: string;
  dischargePort: string;
  deliveryFrom: string;
  incoterm: string;
  origin: string;
}

export interface BankDetails {
  swift: string;
  beneficiary: string;
  account: string;
  bank: string;
  bankAddress: string;
  postCode: string;
}

export interface TermsInfo {
  brand: string;
  damageAllowance: string;
  contractValidTo: string;
  containerType: string;
  numberOfContainers?: number | "";
}

export interface DocumentIdentifiers {
  year: number;
  sequenceNumber: number;
  contractDate: string;
  invoiceDate: string;
  sealNumber: string;
  containerNumber: string;
  blNumber: string;
}

import type { ContractWorkflow } from "./workflow";
import type { ContractContainer } from "./contract";

export interface SalesContractData {
  identifiers: DocumentIdentifiers;
  seller: SellerInfo;
  buyer: BuyerInfo;
  shipping: ShippingInfo;
  lineItems: LineItem[];
  bank: BankDetails;
  terms: TermsInfo;
  /** Optional link to the Seller/Factory database record. Older contracts do not have this. */
  sellerId?: string;
  /** Stage tracker. Older contracts default to "docs-generated" on read via defaultWorkflow(). */
  workflow?: ContractWorkflow;
  /**
   * Canonical B/L number entered on Shipping Tracker. When set, overrides
   * `identifiers.blNumber` on CI / PL / CI-Customs renderings. Optional —
   * older contracts won't have this.
   */
  blNumber?: string | null;
  /**
   * Multiple container numbers entered on Shipping Tracker. Rendered on CI,
   * PL, and CI-Customs (not on the Sales Contract — that's a pre-shipment
   * document).
   */
  containers?: ContractContainer[];
}

export interface ContractTotals {
  totalCartons: number;
  totalQtyMTS: number;
  totalNetWeight: number;
  totalGrossWeight: number;
  totalUSD: number;
}

export interface ActiveContract {
  data: SalesContractData;
  contractNo: string;
  invoiceNo: string;
  dateSubmitted: string;
}

export type ContractStatus = "Active" | "Completed" | "Cancelled";

export interface ContractLogEntry {
  id: string;
  contractNo: string;
  invoiceNo: string;
  dateSubmitted: string;
  buyer: string;
  product: string;
  status: ContractStatus;
  masterSnapshot: SalesContractData;
  /** Optional link to the Seller/Factory database record. Older contracts do not have this. */
  sellerId?: string;
  /** Stage tracker. Mirrors masterSnapshot.workflow for easy filtering without parsing the snapshot. */
  workflow?: ContractWorkflow;
}
