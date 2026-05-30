/**
 * Pure analytics over Supabase contracts (Batch 3.7a, replaces the localStorage
 * contract-log scans that used to live in lib/products.ts).
 *
 * Each function takes the `useContracts()` result (ContractRow[]) and aggregates
 * over `master_snapshot.lineItems` / `master_snapshot.buyer`. No I/O — callers
 * pass already-fetched contracts so React Query handles caching.
 */

import type { ContractRow } from "@/lib/data/contracts";
import type { PriceHistoryEntry } from "@/types/product";

function buyerOf(c: ContractRow): string {
  return c.master_snapshot?.buyer?.company ?? "";
}

function lineItemsOf(c: ContractRow) {
  return c.master_snapshot?.lineItems ?? [];
}

/** Price-history entries for a product across all (non-cancelled) contracts, newest first. */
export function priceHistoryFor(contracts: ContractRow[], productName: string): PriceHistoryEntry[] {
  const entries: PriceHistoryEntry[] = [];
  for (const c of contracts) {
    if (c.status === "Cancelled") continue;
    for (const item of lineItemsOf(c)) {
      if (item.product === productName && typeof item.pricePerMT === "number" && item.pricePerMT > 0) {
        entries.push({
          date: c.created_at,
          priceMT: item.pricePerMT,
          buyer: buyerOf(c),
          contractNo: c.contract_no,
          qtyMTS: item.qtyMTS,
        });
      }
    }
  }
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Most recent price quoted to a buyer for a product, or null. */
export function lastPriceToBuyer(
  contracts: ContractRow[],
  productName: string,
  buyerCompany: string
): number | null {
  const sorted = [...contracts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  for (const c of sorted) {
    if (buyerOf(c).toLowerCase() !== buyerCompany.toLowerCase()) continue;
    for (const item of lineItemsOf(c)) {
      if (item.product === productName && typeof item.pricePerMT === "number" && item.pricePerMT > 0) {
        return item.pricePerMT;
      }
    }
  }
  return null;
}

/** How many (non-cancelled) contracts include a given product. */
export function productUsageCount(contracts: ContractRow[], productName: string): number {
  return contracts.filter(
    (c) => c.status !== "Cancelled" && lineItemsOf(c).some((i) => i.product === productName)
  ).length;
}

/** Contract counts keyed by lowercased buyer company name. */
export function contractCountsByBuyer(contracts: ContractRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of contracts) {
    const key = buyerOf(c).toLowerCase();
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
