/**
 * The copy-to-WhatsApp quote text, English and Arabic.
 *
 * Quotes go out under the NAWA FRESH trading brand. Contract and invoice PDFs
 * still carry the legal Shanghai entity from getDefaultContractData()
 * ("TAFAKAH Food (SHANGHAI) CO., LTD") — a quote is a commercial offer, a
 * contract names the entity that signs it, and those are deliberately allowed
 * to differ. Contact details are still read from that one seller record so a
 * changed phone number reaches every surface at once.
 *
 * Arabic uses Western numerals (1, 2, 3), matching the buyer portal — see the
 * `numberingSystem` note in lib/i18n/format.ts. Traders read prices in Latin
 * digits, and Arabic-Indic digits in a pasted quote invite transcription errors.
 */

import type { Quote } from "@/types/quote";
import { splitIncoterm } from "@/types/sales-contract";
import { getDefaultContractData } from "@/lib/sales-contract";
import { qty, usd, usd0 } from "@/lib/money";
import { CONTAINER_TYPE } from "./defaults";

export const QUOTE_VALID_DAYS = 7;

/**
 * Brand shown on quotes. The name stays in Latin script in the Arabic quote
 * too — Gulf buyers know the brand by its Latin name, and an invented Arabic
 * transliteration of a brand reads as a different company.
 *
 * Email is the brand's own rather than the seller record's, so the address a
 * buyer replies to matches the domain printed two lines below it. The phone
 * still comes from the seller record — one place to change it.
 */
const BRAND = "NAWA FRESH";
const WEBSITE = "nawafresh.com";
const EMAIL = `info@${WEBSITE}`;

/**
 * Arabic names for products added before the products table had a name_ar
 * column. Rows with name_ar set win; this is only a fallback for legacy rows.
 */
const LEGACY_PRODUCT_AR: Record<string, string> = {
  "Fresh Garlic": "ثوم طازج",
  "Fresh Ginger": "زنجبيل طازج",
  "Fresh Kiwi": "كيوي طازج",
  "Fresh Apple": "تفاح طازج",
  "Fresh Onion": "بصل طازج",
};

/** Prefers the products table's name_ar, then the legacy map, then English. */
export function arabicProductName(name: string, nameAr?: string): string {
  return nameAr?.trim() || LEGACY_PRODUCT_AR[name] || name;
}

export interface QuoteTextInput {
  lang: "en" | "ar";
  productName: string;
  productNameAr?: string;
  containers: number;
  cartonsPerContainer: number;
  /**
   * Gross weight per carton — what the quote states, since that is the figure
   * the buyer's freight and customs are assessed on. The net weight still
   * drives the MT quantity and the price, it just is not printed.
   */
  gwPerCarton: number;
  quote: Quote;
}

export function buildQuoteText(input: QuoteTextInput): string {
  const { seller, shipping } = getDefaultContractData();
  const incoterm = splitIncoterm(shipping.incoterm).term;
  const { quote, containers, gwPerCarton } = input;
  const cartons = qty(quote.totals.cartons);
  const mts = qty(quote.totals.qtyMTS, 2);

  if (input.lang === "ar") {
    const product = arabicProductName(input.productName, input.productNameAr);
    return [
      `📦 عرض سعر — ${BRAND}`,
      "",
      `المنتج: ${product}`,
      `الوزن القائم: ${qty(gwPerCarton, 1)} كجم / كرتون`,
      `الحاويات: ${containers} × ${CONTAINER_TYPE} (${cartons} كرتون)`,
      `الكمية: ${mts} طن`,
      "",
      `السعر للطن: ${usd0(quote.quotedPerMT)}`,
      `السعر للكرتون: ${usd(quote.quotedPerCarton)}`,
      `القيمة الإجمالية: ${usd0(quote.quotedTotal)}`,
      "",
      `الشروط: ${incoterm}`,
      `صلاحية العرض: ${QUOTE_VALID_DAYS} أيام من تاريخه`,
      "",
      `— ${BRAND}`,
      `📧 ${EMAIL}`,
      `📱 ${seller.tel}`,
      `🌐 ${WEBSITE}`,
    ].join("\n");
  }

  return [
    `📦 Quote — ${BRAND}`,
    "",
    `Product: ${input.productName}`,
    `Gross weight: ${qty(gwPerCarton, 1)} KG / carton`,
    `Containers: ${containers} × ${CONTAINER_TYPE} (${cartons} cartons)`,
    `Quantity: ${mts} MT`,
    "",
    `Price per MT: ${usd0(quote.quotedPerMT)}`,
    `Price per carton: ${usd(quote.quotedPerCarton)}`,
    `Total value: ${usd0(quote.quotedTotal)}`,
    "",
    `Terms: ${incoterm}`,
    `Validity: ${QUOTE_VALID_DAYS} days from today`,
    "",
    `— ${BRAND}`,
    `📧 ${EMAIL}`,
    `📱 ${seller.tel}`,
    `🌐 ${WEBSITE}`,
  ].join("\n");
}

/** Brand block, exported so the screen and the quote text cannot drift apart. */
export const QUOTE_BRAND = { name: BRAND, website: WEBSITE, email: EMAIL };
