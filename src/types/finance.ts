export interface CostItem {
  id: string;
  category: CostCategory;
  description: string;
  amount: number;
  date: string;
  notes: string;
}

export type CostCategory =
  | "EXW"
  | "EXP"
  | "Packing Materials"
  | "Customs & Port"
  | "Sea Freight"
  | "Insurance"
  | "Inspection / Phyto / CO"
  | "Trucking / Inland"
  | "Bank Charges"
  | "Other";

export const COST_CATEGORIES: CostCategory[] = [
  "EXW", "EXP", "Packing Materials", "Customs & Port", "Sea Freight",
  "Insurance", "Inspection / Phyto / CO", "Trucking / Inland", "Bank Charges", "Other",
];

export interface PaymentItem {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  notes: string;
}

export type PaymentMethod = "T/T Advance" | "T/T Balance" | "L/C" | "Cash" | "Other";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "T/T Advance", "T/T Balance", "L/C", "Cash", "Other",
];

export interface ContractFinance {
  contractNo: string;
  costs: CostItem[];
  payments: PaymentItem[];
  updatedAt: string;
}

export type PaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

export interface FinanceSummary {
  revenue: number;
  totalCost: number;
  grossProfit: number;
  margin: number;
  totalReceived: number;
  outstanding: number;
  paymentStatus: PaymentStatus;
}
