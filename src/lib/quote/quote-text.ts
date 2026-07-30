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
import { PORTS, formatPortValue } from "@/lib/ports";
import { qty, usd, usd0 } from "@/lib/money";
import { CONTAINER_TYPE } from "./defaults";

export const QUOTE_VALID_DAYS = 7;

/**
 * Brand shown on quotes, with the Arabic form the team uses. Email is the
 * brand's own rather than the seller record's, so the address a buyer replies to
 * matches the domain printed two lines below it. The phone still comes from the
 * seller record — one place to change it.
 */
const BRAND = "NAWA FRESH";
/** The brand written in Arabic, as the team writes it. */
const BRAND_AR = "نوى فريش";
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
  /** Stored port values; printed as short names beside FOB and CIF. */
  loadingPort: string;
  dischargePort: string;
  /** Vessel ETD as YYYY-MM-DD; printed so the buyer knows the sailing. */
  etd: string;
  /**
   * What one unit is called for this product — "carton", "mesh bag". Garlic
   * ships in mesh bags, and "11,600 cartons" on a garlic offer is simply wrong.
   */
  packUnit?: string;
  packUnitAr?: string;
  quote: Quote;
}

/** ETD for a quote: "15 Aug 2026" — unambiguous for Gulf and Chinese readers. */
export function formatEtd(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** English plural of a pack unit. All of them pluralise with a trailing s. */
function plural(unit: string): string {
  return unit.endsWith("s") ? unit : unit + "s";
}

/**
 * Turns a stored port value into the short name a quote prints:
 * "SHEKOU PORT, CHINA" -> "Shekou", "KHOR FAKKAN PORT, UAE" -> "Khor Fakkan".
 * The country and the word PORT are dropped because "CIF Jeddah" is how the
 * term is written on an offer.
 */
export function portShortName(stored: string): string {
  if (!stored) return "";
  const head = stored.split(",")[0];
  const qualified = /\(.*?\)/.test(head);
  const bare = head.replace(/\s*\(.*?\)\s*/g, " ").trim();
  // A parenthetical is the city that disambiguates the berth ("Khalifa Port
  // (Abu Dhabi)"), so dropping BOTH it and the word Port would leave an
  // incoterm place no forwarder recognises. Keep "Port" in that case.
  const short = qualified ? bare : bare.replace(/\s*PORT\s*$/i, "").trim();
  return titleCase(short || bare);
}

/**
 * Fallback route from the contract defaults, used to seed a fresh quote.
 *
 * The default incoterm is stored as "CIF JEDDAH", so the destination arrives as
 * the bare place name "JEDDAH". That is resolved to the full port value
 * ("JEDDAH PORT, SAUDI ARABIA") so the port picker shows a real entry rather
 * than a stray fragment sitting next to a properly-formatted loading port.
 */
export function defaultRoute(): { loadingPort: string; dischargePort: string } {
  const { shipping } = getDefaultContractData();
  const place = shipping.dischargePort || splitIncoterm(shipping.incoterm).place;
  return {
    loadingPort: resolvePortValue(shipping.loadingPort),
    dischargePort: resolvePortValue(place),
  };
}

/** Matches a loose place name to a known port, else returns it unchanged. */
function resolvePortValue(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.includes(",")) return raw; // already a full "NAME, COUNTRY" value
  const wanted = raw.toLowerCase();
  const hit = PORTS.find((p) => {
    const name = p.name.toLowerCase();
    return name === wanted || name.startsWith(wanted + " ") || name.replace(/\s*port$/, "") === wanted;
  });
  return hit ? formatPortValue(hit) : raw;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** "FOB Shekou" / "CIF Jeddah", or the bare term when no port is chosen. */
export function quoteTerms(loadingPort: string, dischargePort: string): { fob: string; cif: string } {
  const fob = portShortName(loadingPort);
  const cif = portShortName(dischargePort);
  return { fob: fob ? `FOB ${fob}` : "FOB", cif: cif ? `CIF ${cif}` : "CIF" };
}

export function buildQuoteText(input: QuoteTextInput): string {
  const { seller } = getDefaultContractData();
  const { quote, containers, gwPerCarton } = input;
  const { fob: fobTerm, cif: cifTerm } = quoteTerms(input.loadingPort, input.dischargePort);
  const cartons = qty(quote.totals.cartons);
  const unit = input.packUnit?.trim() || "carton";
  const unitAr = input.packUnitAr?.trim() || "كرتون";

  if (input.lang === "ar") {
    const product = arabicProductName(input.productName, input.productNameAr);
    return [
      `📦 عرض سعر — ${BRAND_AR}`,
      "",
      product,
      // The container type is left off the Arabic quote on purpose — the buyer
      // cares how many containers, not that they are 40'HC.
      `${containers} حاوية · ${cartons} ${unitAr}`,
      `تاريخ الإبحار (ETD): ${formatEtd(input.etd)}`,
      `الوزن الإجمالي: ${qty(gwPerCarton, 1)} كجم لكل ${unitAr}`,
      "",
      `${fobTerm}   ${usd(quote.fobPerCarton)} / ${unitAr}`,
      `${cifTerm}   ${usd(quote.cifPerCarton)} / ${unitAr}`,
      `الإجمالي (${cifTerm})   ${usd0(quote.quotedTotal)}`,
      "",
      `ملاحظة: أجور الشحن البحري غير مستقرة. سعر ${cifTerm} مبني على أجور الشحن الحالية وسيتم تأكيده عند الحجز. سعر ${fobTerm} ثابت لمدة ${QUOTE_VALID_DAYS} أيام من تاريخ هذا العرض.`,
      "",
      `— ${BRAND_AR}`,
      `📧 ${EMAIL}`,
      `📱 ${seller.tel}`,
      `🌐 ${WEBSITE}`,
    ].join("\n");
  }

  return [
    `📦 Quote — ${BRAND}`,
    "",
    input.productName,
    `${containers} × ${CONTAINER_TYPE} · ${cartons} ${plural(unit)} · ${qty(gwPerCarton, 1)} KG gross/${unit}`,
    `ETD: ${formatEtd(input.etd)}`,
    "",
    `${fobTerm}   ${usd(quote.fobPerCarton)} / ${unit}`,
    `${cifTerm}   ${usd(quote.cifPerCarton)} / ${unit}`,
    `Total ${cifTerm}   ${usd0(quote.quotedTotal)}`,
    "",
    `Note: sea freight is unstable. The ${cifTerm} price is based on today's freight rate and will be re-confirmed at the time of booking. The ${fobTerm} price is firm for ${QUOTE_VALID_DAYS} days from the date of this quote.`,
    "",
    `— ${BRAND}`,
    `📧 ${EMAIL}`,
    `📱 ${seller.tel}`,
    `🌐 ${WEBSITE}`,
  ].join("\n");
}

/** Brand block, exported so the screen and the quote text cannot drift apart. */
export const QUOTE_BRAND = { name: BRAND, website: WEBSITE, email: EMAIL };
