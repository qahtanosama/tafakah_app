import type { Seller } from "@/types/seller";

const STORAGE_KEY = "sellers-database";

/** Normalize a record read from localStorage — fills safe defaults without mutating stored data. */
function normalize(raw: Seller): Seller {
  return {
    ...raw,
    products: Array.isArray(raw.products) ? raw.products : [],
    preferredLanguage: raw.preferredLanguage ?? "en",
    defaultDocPreset: raw.defaultDocPreset ?? "factory",
    customMessageTemplate: raw.customMessageTemplate ?? {},
    bankDetails: raw.bankDetails ?? {},
  };
}

export function getSellers(): Seller[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Seller[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize);
  } catch {
    return [];
  }
}

function saveAll(sellers: Seller[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sellers));
}

export function getSellerById(id: string): Seller | undefined {
  return getSellers().find((s) => s.id === id);
}

/** Filter sellers that supply a given product (by product id). */
export function getSellersByProduct(productId: string): Seller[] {
  if (!productId) return [];
  return getSellers().filter((s) => s.products.includes(productId));
}

export function saveSeller(seller: Seller): void {
  seller.updatedAt = new Date().toISOString();
  const all = getSellers();
  const idx = all.findIndex((s) => s.id === seller.id);
  if (idx >= 0) all[idx] = seller;
  else all.push(seller);
  saveAll(all);
}

export function deleteSeller(id: string): void {
  saveAll(getSellers().filter((s) => s.id !== id));
}

export function createEmptySeller(): Seller {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    companyName: "",
    companyNameCn: "",
    contactName: "",
    contactTitle: "",
    whatsappNumber: "",
    phoneNumber: "",
    email: "",
    preferredLanguage: "en",
    country: "",
    city: "",
    address: "",
    products: [],
    paymentTerms: "",
    leadTimeDays: undefined,
    bankDetails: {},
    customMessageTemplate: {},
    defaultDocPreset: "factory",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}
