import type { ProductProfile, PriceHistoryEntry } from "@/types/product";
import { getContractLog } from "./contract-log";

const STORAGE_KEY = "products-database";

const DEFAULTS: ProductProfile[] = [
  { id: "ginger", name: "Fresh Ginger", hsCode: "0910.1100", prefix: "GG", defaultNW: 10, defaultGW: 11, defaultPriceMT: 1200, containerType: "1\u00d740'RH", notes: "" },
  { id: "garlic", name: "Fresh Garlic", hsCode: "070320", prefix: "GL", defaultNW: 2.3, defaultGW: 2.5, defaultPriceMT: 1350, containerType: "1\u00d740'RH", notes: "" },
  { id: "kiwi", name: "Fresh Kiwi", hsCode: "081050", prefix: "KW", defaultNW: 3.5, defaultGW: 4, defaultPriceMT: 2000, containerType: "1\u00d740'RH", notes: "" },
  { id: "apple", name: "Fresh Apple", hsCode: "080810", prefix: "APP", defaultNW: 18, defaultGW: 20, defaultPriceMT: 800, containerType: "1\u00d740'RH", notes: "" },
];

export function getProducts(): ProductProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveProd(DEFAULTS);
      return DEFAULTS;
    }
    return JSON.parse(raw) as ProductProfile[];
  } catch {
    return DEFAULTS;
  }
}

function saveProd(products: ProductProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

export function saveProducts(products: ProductProfile[]): void {
  saveProd(products);
}

export function updateProduct(product: ProductProfile): void {
  const products = getProducts().map((p) => (p.id === product.id ? product : p));
  saveProd(products);
}

export function getProductByName(name: string): ProductProfile | undefined {
  return getProducts().find((p) => p.name === name);
}

export function getPriceHistory(productName: string): PriceHistoryEntry[] {
  const log = getContractLog();
  const entries: PriceHistoryEntry[] = [];
  for (const contract of log) {
    for (const item of contract.masterSnapshot.lineItems) {
      if (item.product === productName && typeof item.pricePerMT === "number" && item.pricePerMT > 0) {
        entries.push({
          date: contract.dateSubmitted,
          priceMT: item.pricePerMT,
          buyer: contract.buyer,
          contractNo: contract.contractNo,
          qtyMTS: item.qtyMTS,
        });
      }
    }
  }
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getLastPriceToBuyer(productName: string, buyerCompany: string): number | null {
  const log = getContractLog();
  for (let i = log.length - 1; i >= 0; i--) {
    const c = log[i];
    if (c.buyer.toLowerCase() !== buyerCompany.toLowerCase()) continue;
    for (const item of c.masterSnapshot.lineItems) {
      if (item.product === productName && typeof item.pricePerMT === "number" && item.pricePerMT > 0) {
        return item.pricePerMT;
      }
    }
  }
  return null;
}
