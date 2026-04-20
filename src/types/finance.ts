export interface CostItem {
  id: string;
  category: string;
  isPredefined: boolean;
  description: string;
  amount: number;
  date: string;
  notes: string;
}

export const PREDEFINED_COSTS: { id: string; category: string }[] = [
  { id: "exw", category: "EXW" },
  { id: "exp", category: "Export Fee (EXP)" },
  { id: "packing", category: "Packing Materials" },
  { id: "customs", category: "Customs & Port Expenses" },
  { id: "freight", category: "Sea Freight" },
  { id: "insurance", category: "Insurance" },
  { id: "inspection", category: "Inspection / Phyto / CO" },
  { id: "trucking", category: "Trucking / Inland Transport" },
  { id: "bank", category: "Bank Charges" },
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
