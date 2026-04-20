import type { ContractFinance, CostItem, PaymentItem, FinanceSummary, PaymentStatus } from "@/types/finance";
import { PREDEFINED_COSTS } from "@/types/finance";

const STORAGE_KEY = "contract-finance";

export function getAllFinance(): ContractFinance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ContractFinance[];
  } catch {
    return [];
  }
}

function saveAll(data: ContractFinance[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getFinance(contractNo: string): ContractFinance | null {
  return getAllFinance().find((f) => f.contractNo === contractNo) ?? null;
}

export function saveFinance(finance: ContractFinance): void {
  finance.updatedAt = new Date().toISOString();
  const all = getAllFinance();
  const idx = all.findIndex((f) => f.contractNo === finance.contractNo);
  if (idx >= 0) all[idx] = finance;
  else all.push(finance);
  saveAll(all);
}

export function createEmptyFinance(contractNo: string): ContractFinance {
  const costs: CostItem[] = PREDEFINED_COSTS.map((p) => ({
    id: p.id,
    category: p.category,
    isPredefined: true,
    description: "",
    amount: 0,
    date: "",
    notes: "",
  }));
  return { contractNo, costs, payments: [], updatedAt: new Date().toISOString() };
}

/** Ensure a finance entry has all predefined rows (migration for old data) */
export function ensurePredefinedRows(finance: ContractFinance): ContractFinance {
  for (const p of PREDEFINED_COSTS) {
    if (!finance.costs.some((c) => c.id === p.id)) {
      finance.costs.splice(PREDEFINED_COSTS.indexOf(p), 0, {
        id: p.id, category: p.category, isPredefined: true,
        description: "", amount: 0, date: "", notes: "",
      });
    }
  }
  return finance;
}

export function addCost(contractNo: string, cost: CostItem): void {
  let f = getFinance(contractNo);
  if (!f) f = createEmptyFinance(contractNo);
  f.costs.push(cost);
  saveFinance(f);
}

export function updateCost(contractNo: string, cost: CostItem): void {
  const f = getFinance(contractNo);
  if (!f) return;
  f.costs = f.costs.map((c) => (c.id === cost.id ? cost : c));
  saveFinance(f);
}

export function deleteCost(contractNo: string, costId: string): void {
  const f = getFinance(contractNo);
  if (!f) return;
  f.costs = f.costs.filter((c) => c.id !== costId);
  saveFinance(f);
}

export function addPayment(contractNo: string, payment: PaymentItem): void {
  let f = getFinance(contractNo);
  if (!f) f = createEmptyFinance(contractNo);
  f.payments.push(payment);
  saveFinance(f);
}

export function deletePayment(contractNo: string, paymentId: string): void {
  const f = getFinance(contractNo);
  if (!f) return;
  f.payments = f.payments.filter((p) => p.id !== paymentId);
  saveFinance(f);
}

export function calcSummary(revenue: number, finance: ContractFinance | null): FinanceSummary {
  const totalCost = finance ? finance.costs.reduce((s, c) => s + c.amount, 0) : 0;
  const totalReceived = finance ? finance.payments.reduce((s, p) => s + p.amount, 0) : 0;
  const grossProfit = revenue - totalCost;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const outstanding = revenue - totalReceived;

  let paymentStatus: PaymentStatus = "unpaid";
  if (totalReceived <= 0) paymentStatus = "unpaid";
  else if (totalReceived >= revenue - 1) paymentStatus = totalReceived > revenue + 1 ? "overpaid" : "paid";
  else paymentStatus = "partial";

  return { revenue, totalCost, grossProfit, margin, totalReceived, outstanding, paymentStatus };
}
