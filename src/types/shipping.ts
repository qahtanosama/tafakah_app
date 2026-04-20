export type ShippingLine =
  | "Maersk"
  | "MSC"
  | "COSCO"
  | "Evergreen"
  | "CMA CGM"
  | "Hapag-Lloyd"
  | "ONE"
  | "Yang Ming"
  | "HMM"
  | "Other"
  | "";

export const SHIPPING_LINES: Exclude<ShippingLine, "">[] = [
  "Maersk",
  "MSC",
  "COSCO",
  "Evergreen",
  "CMA CGM",
  "Hapag-Lloyd",
  "ONE",
  "Yang Ming",
  "HMM",
  "Other",
];

export type ShippingStatusOverride =
  | "auto"
  | "pending"
  | "at_sea"
  | "delivered"
  | "delayed"
  | "cancelled";

export type ShippingStatus =
  | "not_scheduled"
  | "pending"
  | "at_sea"
  | "delivered"
  | "delayed"
  | "cancelled";

export interface ShippingEntry {
  contractNo: string;
  shippingLine: ShippingLine;
  bookingRef: string;
  vesselName: string;
  voyageNumber: string;
  blNumber: string;
  cutoffDate: string;
  loadingDate: string;
  etd: string;
  atd: string | null;
  eta: string;
  ata: string | null;
  containerNumber: string;
  sealNumber: string;
  statusOverride: ShippingStatusOverride;
  notes: string;
  updatedAt: string;
}

export interface ShippingStatusInfo {
  status: ShippingStatus;
  label: string;
  icon: string;
  badgeColor: string;
  daysLabel: string;
}
