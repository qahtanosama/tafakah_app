export type SellerLanguage = "en" | "ar" | "zh";
export type SellerDocPreset = "factory" | "all";

export interface SellerBankDetails {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  swift?: string;
}

export interface SellerMessageTemplate {
  en?: string;
  ar?: string;
  zh?: string;
}

export interface Seller {
  id: string;
  companyName: string;
  companyNameCn?: string;
  contactName: string;
  contactTitle?: string;
  whatsappNumber?: string;
  phoneNumber?: string;
  email?: string;
  preferredLanguage?: SellerLanguage;
  country: string;
  city?: string;
  address?: string;
  /** Product IDs (from products-database) that this factory supplies */
  products: string[];
  paymentTerms?: string;
  leadTimeDays?: number;
  bankDetails?: SellerBankDetails;
  customMessageTemplate?: SellerMessageTemplate;
  defaultDocPreset?: SellerDocPreset;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SellerMessagingDefaults {
  whatsappNumber: string;
  preferredLanguage: SellerLanguage;
  defaultDocPreset: SellerDocPreset;
  customMessageTemplate: SellerMessageTemplate;
}

/** Non-mutating read: returns messaging fields with safe defaults */
export function readSellerMessaging(seller: Seller | null | undefined): SellerMessagingDefaults {
  return {
    whatsappNumber: seller?.whatsappNumber ?? "",
    preferredLanguage: seller?.preferredLanguage ?? "en",
    defaultDocPreset: seller?.defaultDocPreset ?? "factory",
    customMessageTemplate: seller?.customMessageTemplate ?? {},
  };
}

export const SELLER_COUNTRIES = [
  "China", "Kenya", "Vietnam", "Thailand", "India", "Pakistan",
  "Turkey", "Egypt", "Peru", "Chile", "South Africa", "Indonesia",
  "Philippines", "Other",
];

/** Strict E.164: "+" followed by first-non-zero digit and 7-14 more digits */
export function isValidSellerE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
