export type BuyerLanguage = "en" | "ar";
export type BuyerDocPreset = "buyer" | "bank" | "customs" | "all";

export interface BuyerMessageTemplate {
  en?: string;
  ar?: string;
}

export interface Buyer {
  id: string;
  company: string;
  shortName: string;
  address: string;
  additionalNumber: string;
  cityPostal: string;
  country: string;
  email: string;
  ccEmail: string;
  phone: string;
  contactPerson: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** E.164, e.g. "+966501234567", no spaces */
  whatsappNumber?: string;
  preferredLanguage?: BuyerLanguage;
  defaultDocPreset?: BuyerDocPreset;
  customMessageTemplate?: BuyerMessageTemplate;
}

export interface BuyerMessagingDefaults {
  whatsappNumber: string;
  preferredLanguage: BuyerLanguage;
  defaultDocPreset: BuyerDocPreset;
  customMessageTemplate: BuyerMessageTemplate;
}

/** Non-mutating read: returns messaging fields with safe defaults */
export function readBuyerMessaging(buyer: Buyer | null | undefined): BuyerMessagingDefaults {
  return {
    whatsappNumber: buyer?.whatsappNumber ?? "",
    preferredLanguage: buyer?.preferredLanguage ?? "en",
    defaultDocPreset: buyer?.defaultDocPreset ?? "buyer",
    customMessageTemplate: buyer?.customMessageTemplate ?? {},
  };
}

/** Strict E.164: "+" followed by 8-15 digits, no spaces or punctuation */
export function isValidE164(value: string): boolean {
  return /^\+\d{8,15}$/.test(value);
}

export const BUYER_COUNTRIES = [
  "Saudi Arabia", "UAE", "Kuwait", "Qatar", "Bahrain", "Oman",
  "Egypt", "Kenya", "Tanzania", "Djibouti",
  "India", "Pakistan", "Bangladesh", "Sri Lanka",
  "Malaysia", "Singapore", "Indonesia", "Vietnam", "Thailand", "Philippines",
  "Netherlands", "Belgium", "Germany", "UK", "Spain", "Italy",
  "USA", "Canada", "Brazil",
  "T\u00FCrkiye", "Russia", "Australia",
  "Other",
];
