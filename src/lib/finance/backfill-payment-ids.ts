import type { ContractFinance } from "@/types/finance";

export function backfillPaymentIds(
  financeRecord: ContractFinance,
): { changed: boolean; record: ContractFinance } {
  let changed = false;
  const payments = (financeRecord.payments ?? []).map((p) => {
    if (!p.id) {
      changed = true;
      return { ...p, id: crypto.randomUUID() };
    }
    return p;
  });
  return { changed, record: { ...financeRecord, payments } };
}
