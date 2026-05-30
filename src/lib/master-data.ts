// Master Data form DRAFT only — transient per-machine working state (intentional
// localStorage). Contracts themselves live in Supabase (src/lib/data/contracts.ts).
import type { SalesContractData } from "@/types/sales-contract";
import { getDefaultContractData } from "@/lib/sales-contract";

const STORAGE_KEY = "tafakah-master-data";

export function saveMasterData(data: SalesContractData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

export function loadMasterData(): SalesContractData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const defaults = getDefaultContractData();

    // Migrate: merge with defaults so new fields get safe values
    const data: SalesContractData = {
      identifiers: { ...defaults.identifiers, ...stored.identifiers },
      seller: { ...defaults.seller, ...stored.seller },
      buyer: { ...defaults.buyer, ...stored.buyer },
      shipping: { ...defaults.shipping, ...stored.shipping },
      lineItems: stored.lineItems ?? defaults.lineItems,
      bank: { ...defaults.bank, ...stored.bank },
      terms: { ...defaults.terms, ...stored.terms },
    };

    // Migrate sequenceNumber from string to number
    if (typeof data.identifiers.sequenceNumber === "string") {
      const parsed = parseInt(data.identifiers.sequenceNumber, 10);
      data.identifiers.sequenceNumber = isNaN(parsed) ? 0 : parsed;
    }

    return data;
  } catch {
    return null;
  }
}

export function resetMasterData(): SalesContractData {
  const defaults = getDefaultContractData();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return defaults;
}

export function hasMasterData(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
