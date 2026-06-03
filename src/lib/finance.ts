import type { ContractFinance, CostItem, PaymentItem, FinanceSummary, PaymentStatus } from "@/types/finance";
import { PREDEFINED_COSTS } from "@/types/finance";
import { backfillPaymentIds } from "@/lib/finance/backfill-payment-ids";

const STORAGE_KEY = "contract-finance";

/** Usual RMB→USD (¥ per $1) range — outside this we warn the user. */
export const RMB_RATE_MIN = 5;
export const RMB_RATE_MAX = 10;

/** A rate is usable for conversion iff it's a positive finite number. */
export function isValidRmbRate(rate: number | null | undefined): rate is number {
  return typeof rate === "number" && isFinite(rate) && rate > 0;
}

/** Soft validation message for the rate input, or null if it looks fine. */
export function rmbRateWarning(rate: number | null | undefined): string | null {
  if (rate == null) return null;
  if (!(typeof rate === "number" && isFinite(rate)) || rate <= 0) {
    return "Rate must be a positive number.";
  }
  if (rate < 2 || rate > 20) {
    return `⚠ ${rate} looks like a typo — RMB/USD is normally about 7 (¥ per $1).`;
  }
  if (rate < RMB_RATE_MIN || rate > RMB_RATE_MAX) {
    return `⚠ ${rate} is outside the usual ${RMB_RATE_MIN}–${RMB_RATE_MAX} range — double-check.`;
  }
  return null;
}

/**
 * Convert a single cost item to USD. USD items pass through; RMB items are
 * divided by the rate (¥ per $1). RMB with no valid rate yields 0 — the UI
 * warns, so this never silently understates cost without a visible flag.
 * A missing `currency` is treated as USD (legacy data).
 */
export function costToUSD(cost: CostItem, rate: number | null | undefined): number {
  const currency = cost.currency ?? "USD";
  if (currency === "RMB") {
    return isValidRmbRate(rate) ? cost.amount / rate : 0;
  }
  return cost.amount;
}

export function getAllFinance(): ContractFinance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ContractFinance[];
    let mutated = false;
    const out = parsed.map((f) => {
      const { changed, record } = backfillPaymentIds(f);
      if (changed) mutated = true;
      return record;
    });
    if (mutated) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(out)); } catch { /* ignore */ }
    }
    return out;
  } catch {
    return [];
  }
}

function saveAll(data: ContractFinance[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getFinance(contractNo: string): ContractFinance | null {
  const found = getAllFinance().find((f) => f.contractNo === contractNo) ?? null;
  if (!found) return null;
  return backfillPaymentIds(found).record;
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
    currency: "USD",
    date: "",
    notes: "",
  }));
  return { contractNo, costs, payments: [], rmbUsdRate: null, updatedAt: new Date().toISOString() };
}

/** Ensure a finance entry has all predefined rows (migration for old data) */
export function ensurePredefinedRows(finance: ContractFinance): ContractFinance {
  for (const p of PREDEFINED_COSTS) {
    if (!finance.costs.some((c) => c.id === p.id)) {
      finance.costs.splice(PREDEFINED_COSTS.indexOf(p), 0, {
        id: p.id, category: p.category, isPredefined: true,
        description: "", amount: 0, currency: "USD", date: "", notes: "",
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
  // Costs may be USD or RMB; convert each to USD via the per-contract rate.
  const rate = finance?.rmbUsdRate ?? null;
  const totalCost = finance ? finance.costs.reduce((s, c) => s + costToUSD(c, rate), 0) : 0;
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
