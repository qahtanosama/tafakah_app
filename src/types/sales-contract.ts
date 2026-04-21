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
  company: string;
  address: string;
  additionalNumber: string;
  cityPostal: string;
  email: string;
  ccEmail: string;
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
