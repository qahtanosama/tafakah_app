import type { SalesContractData, ActiveContract } from "@/types/sales-contract";
import { getDefaultContractData } from "@/lib/sales-contract";

const STORAGE_KEY = "tafakah-master-data";
const ACTIVE_KEY = "active-submitted-contract";

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

export function saveActiveContract(active: ActiveContract): void {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  } catch {
    // localStorage full or unavailable
  }
}

export function loadActiveContract(): ActiveContract | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveContract;
  } catch {
    return null;
  }
}
