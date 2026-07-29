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

/**
 * Named places for the two terms. Both come from the contract defaults so the
 * quote, the contract and the PDFs cannot drift apart — the loading port for
 * FOB, the incoterm's own named place for CIF.
 */
export function quotePlaces(): { fob: string; cif: string } {
  const { shipping } = getDefaultContractData();
  return {
    // "SHEKOU PORT, CHINA" -> "SHEKOU"
    fob: titleCase(shipping.loadingPort.split(/[,]/)[0].replace(/\s*PORT\s*$/i, "").trim()),
    cif: titleCase(splitIncoterm(shipping.incoterm).place),
  };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildQuoteText(input: QuoteTextInput): string {
  const { seller } = getDefaultContractData();
  const { quote, containers, gwPerCarton } = input;
  const places = quotePlaces();
  const fobTerm = places.fob ? `FOB ${places.fob}` : "FOB";
  const cifTerm = places.cif ? `CIF ${places.cif}` : "CIF";
  const cartons = qty(quote.totals.cartons);

  if (input.lang === "ar") {
    const product = arabicProductName(input.productName, input.productNameAr);
    return [
      `📦 عرض سعر — ${BRAND}`,
      "",
      product,
      `${containers} × ${CONTAINER_TYPE} · ${cartons} كرتون · ${qty(gwPerCarton, 1)} كجم قائم/كرتون`,
      "",
      `${fobTerm}   ${usd(quote.fobPerCarton)} / كرتون`,
      `${cifTerm}   ${usd(quote.cifPerCarton)} / كرتون`,
      `الإجمالي ${cifTerm}   ${usd0(quote.quotedTotal)}`,
      "",
      `ملاحظة: أجور الشحن البحري غير مستقرة. سعر ${cifTerm} مبني على سعر الشحن الحالي وسيتم تأكيده عند الحجز. سعر ${fobTerm} ثابت لمدة ${QUOTE_VALID_DAYS} أيام.`,
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
    input.productName,
    `${containers} × ${CONTAINER_TYPE} · ${cartons} cartons · ${qty(gwPerCarton, 1)} KG gross/carton`,
    "",
    `${fobTerm}   ${usd(quote.fobPerCarton)} / carton`,
    `${cifTerm}   ${usd(quote.cifPerCarton)} / carton`,
    `Total ${cifTerm}   ${usd0(quote.quotedTotal)}`,
    "",
    `Note: sea freight is unstable. The ${cifTerm} price is based on today's freight rate and will be re-confirmed at the time of booking. The ${fobTerm} price is firm for ${QUOTE_VALID_DAYS} days.`,
    "",
    `— ${BRAND}`,
    `📧 ${EMAIL}`,
    `📱 ${seller.tel}`,
    `🌐 ${WEBSITE}`,
  ].join("\n");
}

/** Brand block, exported so the screen and the quote text cannot drift apart. */
export const QUOTE_BRAND = { name: BRAND, website: WEBSITE, email: EMAIL };
