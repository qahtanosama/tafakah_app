import type { Buyer } from "@/types/buyer";

const STORAGE_KEY = "buyers-database";

export function getBuyers(): Buyer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Buyer[];
  } catch {
    return [];
  }
}

export function saveBuyers(buyers: Buyer[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(buyers));
}

export function addBuyer(buyer: Buyer): void {
  const buyers = getBuyers();
  buyers.push(buyer);
  saveBuyers(buyers);
}

export function updateBuyer(buyer: Buyer): void {
  const buyers = getBuyers().map((b) => (b.id === buyer.id ? buyer : b));
  saveBuyers(buyers);
}

export function deleteBuyer(id: string): void {
  saveBuyers(getBuyers().filter((b) => b.id !== id));
}

export function findBuyerByCompany(company: string): Buyer | undefined {
  return getBuyers().find((b) => b.company.toLowerCase() === company.toLowerCase());
}

export function createEmptyBuyer(): Buyer {
  return {
    id: crypto.randomUUID(),
    company: "", shortName: "", address: "", additionalNumber: "",
    cityPostal: "", country: "", email: "", ccEmail: "",
    phone: "", contactPerson: "", notes: "",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}
