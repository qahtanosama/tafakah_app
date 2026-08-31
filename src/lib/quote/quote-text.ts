/**
 * The copy-to-WhatsApp quote text, English and Arabic.
 *
 * Quotes go out under the NAWA FRESH trading brand. Contract and invoice PDFs
 * still carry the legal Shanghai entity from getDefaultContractData()
 * ("TAFAKAH Food (SHANGHAI) CO., LTD") — a quote is a commercial offer, a
 * contract names the entity that signs it, and those are deliberately allowed
 * to differ. The brand's contact details live here too — email, website and
 * phone are the trading brand's, not the seller record's.
 *
 * Arabic uses Western numerals (1, 2, 3), matching the buyer portal — see the
 * `numberingSystem` note in lib/i18n/format.ts. Traders read prices in Latin
 * digits, and Arabic-Indic digits in a pasted quote invite transcription errors.
 */

import type { Quote } from "@/types/quote";
import type { QuoteLang } from "./storage";
import type { Market } from "./markets";
import { splitIncoterm } from "@/types/sales-contract";
import { getDefaultContractData } from "@/lib/sales-contract";
import { PORTS, formatPortValue } from "@/lib/ports";
import { qty, usd, usd0 } from "@/lib/money";
import { CONTAINER_TYPE } from "./defaults";

export const QUOTE_VALID_DAYS = 7;

/**
 * Brand shown on quotes, with the Arabic form the team uses. Email and phone are
 * the brand's own rather than the seller record's, so the address a buyer replies
 * to matches the domain beside it and the call lands on the trading line.
 *
 * Only the website reaches the pasted quote — the buyer already has the number
 * he is being messaged on, so repeating it under every offer is filler. Email
 * and phone print on the letterhead price offer, which travels on its own.
 */
const BRAND = "NAWA FRESH";
/** The brand written in Arabic, as the team writes it. */
const BRAND_AR = "نوى فريش";
const WEBSITE = "nawafresh.com";
const EMAIL = `info@${WEBSITE}`;
/**
 * The trading brand's line, not the Shanghai office line that prints on
 * contracts (seller.tel in getDefaultContractData, unchanged). Written with the
 * country code because a Gulf buyer cannot dial it without one.
 */
const PHONE = "+86 188 1666 0573";

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

/**
 * Russian names for rows added before the products table carried one. Keyed on
 * the English name, which every product has.
 */
const RU_PRODUCT: Record<string, string> = {
  "Fresh Garlic": "Чеснок свежий",
  "Fresh Ginger": "Имбирь свежий",
  "Fresh Kiwi": "Киви свежий",
  "Fresh Apple": "Яблоко свежее",
  "Fresh Onion": "Лук свежий",
  "Fresh Lemon": "Лимон свежий",
  "FRESH CARROTS": "Морковь свежая",
};

/** Matches on a substring so "Fresh Garlic-Mesh" resolves like "Fresh Garlic". */
export function russianProductName(name: string): string {
  const hit = Object.keys(RU_PRODUCT).find((k) => name.toLowerCase().includes(k.toLowerCase()));
  return hit ? RU_PRODUCT[hit] : name;
}

/**
 * Russian counts take the genitive plural after any number above four, which is
 * the only range these box counts ever hit — so one form each is enough.
 * "коробок" after the count, "коробку" after the preposition "за".
 */
const RU_UNIT = "коробок";
const RU_UNIT_GEN = "коробку";

/**
 * The one emoji a quote carries: the goods themselves, so a buyer scrolling a
 * WhatsApp thread of offers can tell at a glance which one this is.
 *
 * Matched on the English name, which every product has — the Arabic quote needs
 * the same mark and `name_ar` is optional. Substring matching, because rows are
 * named "Fresh Ginger Black Cat" and "Fresh Garlic 5.5cm", not "Ginger".
 * Anything unmatched simply gets no emoji rather than a generic box.
 */
const PRODUCT_EMOJI: [match: string, emoji: string][] = [
  ["garlic", "🧄"],
  ["avocado", "🥑"],
  ["ginger", "🫚"],
  ["onion", "🧅"],
  ["carrot", "🥕"],
  ["kiwi", "🥝"],
  ["apple", "🍎"],
  ["orange", "🍊"],
  ["lemon", "🍋"],
  ["potato", "🥔"],
  ["tomato", "🍅"],
  ["cabbage", "🥬"],
  ["broccoli", "🥦"],
  ["pepper", "🌶️"],
  ["chilli", "🌶️"],
  ["mushroom", "🍄"],
  ["grape", "🍇"],
  ["pear", "🍐"],
  ["peach", "🍑"],
  ["mango", "🥭"],
  ["banana", "🍌"],
  ["watermelon", "🍉"],
  ["melon", "🍈"],
  ["peanut", "🥜"],
];

export function productEmoji(name: string): string {
  const n = name.toLowerCase();
  return PRODUCT_EMOJI.find(([match]) => n.includes(match))?.[1] ?? "";
}

export interface QuoteTextInput {
  lang: QuoteLang;
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
  /** Drives the incoterms, the destination vocabulary and the caveat. */
  market: Market;
  /** Where the goods are grown, printed as provenance on an overland quote. */
  origin?: string;
  /** How the buyer pays, in this quote's language. */
  paymentTerms?: string;
  quote: Quote;
}

/**
 * The departure date on a quote: "15 Aug 2026".
 *
 * en-GB by default — an abbreviated month is unambiguous for Gulf and Chinese
 * readers in a way that 08/09/2026 is not. A Russian quote formats in ru-RU
 * instead, because an English month name mid-sentence in Cyrillic reads as a
 * machine assembled it.
 */
export function formatEtd(iso: string, lang: QuoteLang = "en"): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  const locale = lang === "ru" ? "ru-RU" : "en-GB";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
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

/**
 * The name a quote prints for a place.
 *
 * Sea ports go through portShortName, which strips the country and the word
 * PORT: "CIF Jeddah" is how the term is written. Overland places are already
 * written as they should be read and are used verbatim — running "FOOD CITY
 * (MOSCOW), RUSSIA" through portShortName would drop the parenthetical and
 * quote "DAP Food City", losing the city entirely.
 */
export function placeShortName(market: Market, stored: string): string {
  if (!stored) return "";
  if (market.destinations !== "overland") return portShortName(stored);
  return titleCasePlace(stored.split(",")[0]);
}

/**
 * Like titleCase, but capitalises the first LETTER of each word rather than the
 * first character — so "(moscow)" becomes "(Moscow)" and not "(moscow)".
 *
 * Overland names carry their qualifier into the incoterm ("DAP Food City
 * (Moscow)"), where titleCase would leave the city lowercased. Kept separate
 * from titleCase because portShortName's output is pinned by tests and strips
 * parentheticals before it ever gets here.
 */
function titleCasePlace(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/\p{L}/u, (c) => c.toUpperCase()))
    .join(" ");
}

/**
 * "FOB Shekou" / "CIF Jeddah", or "FCA Khorgos" / "DAP Food City (Moscow)".
 *
 * A sea market hands over at the port it loads from, so the base term names the
 * origin. An overland market with a `basePlace` hands over there instead — the
 * Russian route is collected at the Khorgos border, while the goods themselves
 * come from Anqiu or Jining. That origin is provenance, not an incoterm place,
 * and printing "FCA Anqiu" would offer a handover nobody is actually offering.
 */
export function quoteTerms(
  market: Market,
  origin: string,
  destination: string
): { base: string; delivered: string } {
  const from = placeShortName(market, market.basePlace ?? origin);
  const to = placeShortName(market, destination);
  return {
    base: from ? `${market.terms.base} ${from}` : market.terms.base,
    delivered: to ? `${market.terms.delivered} ${to}` : market.terms.delivered,
  };
}

/**
 * The quote as a WhatsApp message — which is what this text is for, and what
 * shapes every decision below.
 *
 * WHATSAPP RENDERS IN A PROPORTIONAL FONT. Padding with runs of spaces to make
 * price columns line up cannot work: "FOB Shekou" and "CIF Jeddah" are different
 * widths on screen even though they are the same length in characters, so the
 * figures land ragged on the buyer's phone however they look in the editor.
 * Each price line is therefore self-contained — term, then both prices joined by
 * a separator — and nothing depends on alignment.
 *
 * `*asterisks*` are WhatsApp's bold markup and render as bold in the message.
 * They are deliberate, not stray punctuation: the incoterm, the product and the
 * total are what a buyer scans for, and bold is the only visual hierarchy the
 * medium offers. The markers stay literal in the preview box, which is the raw
 * text that gets copied.
 *
 * Lines are kept short because a wrapped line reads as a mess in a chat bubble;
 * the cargo detail is split across three short lines rather than crammed into
 * two long ones. Same reason the freight caveat is one sentence.
 *
 * The only emoji is the product's own (see `productEmoji`). A quote decorated
 * with a box, an envelope and a globe reads as something a machine assembled,
 * which is not the impression a price offer should make; the goods marker earns
 * its place by making the offer findable in a thread of them.
 *
 * Prices are quoted per carton, with ONE ton price — CIF, on its own line,
 * restated with `=` so it reads as the same offer in another unit rather than a
 * third price. The carton price is what gets negotiated; the ton price is what a
 * buyer compares against other suppliers, and if he divides it out himself he
 * will use the gross weight and land on a different number than ours. FOB per
 * ton is left off deliberately — it is the carton price that is firm, and a
 * second ton figure invites the two to be read as competing quotes. The per-MT
 * figure comes from `computeQuote`, derived from the net weight.
 *
 * The bare domain on the last line is left unadorned so WhatsApp auto-links it
 * and draws its own preview card.
 */
export function buildQuoteText(input: QuoteTextInput): string {
  const { quote, containers, gwPerCarton } = input;
  const { base: baseTerm, delivered: deliveredTerm } = quoteTerms(
    input.market,
    input.loadingPort,
    input.dischargePort
  );
  const cartons = qty(quote.totals.cartons);
  const unit = input.packUnit?.trim() || "carton";
  const unitAr = input.packUnitAr?.trim() || "كرتون";
  /**
   * Trimmed because the products table is hand-edited and "Avocado " with a
   * trailing space is a real row. This is not tidiness: WhatsApp only renders
   * `*bold*` when the closing marker sits against a non-space character, so
   * `*Avocado *` reaches the buyer with the asterisks showing.
   */
  const productName = input.productName.trim();
  // Trailing space folded in, so an unmatched product does not leave the line
  // starting with a gap.
  const mark = productEmoji(productName);
  const emoji = mark ? mark + " " : "";

  if (input.lang === "ar") {
    const product = arabicProductName(productName, input.productNameAr);
    return [
      `*${BRAND_AR}* — عرض سعر`,
      "",
      `${emoji}*${product}*`,
      // The container type is left off the Arabic quote on purpose — the buyer
      // cares how many containers, not that they are 40'HC.
      `${containers} حاوية · ${cartons} ${unitAr}`,
      `${qty(gwPerCarton, 1)} كجم إجمالي لكل ${unitAr}`,
      `ETD: ${formatEtd(input.etd)}`,
      "",
      // Omitted on a delivered-price market, which quotes one figure.
      ...(quote.fobPerCarton !== null ? [`*${baseTerm}* ${usd(quote.fobPerCarton)}/${unitAr}`] : []),
      `*${deliveredTerm}* ${usd(quote.cifPerCarton)}/${unitAr}`,
      `= ${usd0(quote.quotedPerMT)} لكل طن`,
      `*الإجمالي* ${usd0(quote.quotedTotal)} (${deliveredTerm})`,
      "",
      ...(input.paymentTerms ? [`الدفع: ${input.paymentTerms}`, ""] : []),
      `أجور الشحن البحري متغيرة — سعر CIF يُعاد تأكيده عند الحجز. سعر FOB ثابت لمدة ${QUOTE_VALID_DAYS} أيام.`,
      "",
      WEBSITE,
    ].join("\n");
  }

  if (input.lang === "ru") {
    const product = russianProductName(productName);
    return [
      `*${BRAND}* — Коммерческое предложение`,
      "",
      `${emoji}*${product}*`,
      `${containers} × ${CONTAINER_TYPE} · ${cartons} ${RU_UNIT}`,
      `${qty(gwPerCarton, 1)} кг брутто за ${RU_UNIT_GEN}`,
      // Where the goods are grown — provenance, not the handover point.
      ...(input.origin?.trim() ? [`Происхождение: ${input.origin.trim()}`] : []),
      // Overland: the cargo is dispatched from the packhouse, not sailed.
      `Отгрузка: ${formatEtd(input.etd, "ru")}`,
      "",
      // Two prices, so the buyer can either collect at the border or take it
      // delivered. Delivered − base is exactly the onward leg at cost.
      ...(quote.fobPerCarton !== null
        ? [`*${baseTerm}* ${usd(quote.fobPerCarton)}/${RU_UNIT_GEN}`]
        : []),
      `*${deliveredTerm}* ${usd(quote.cifPerCarton)}/${RU_UNIT_GEN}`,
      `= ${usd0(quote.quotedPerMT)} за тонну`,
      `*Итого* ${usd0(quote.quotedTotal)} (${deliveredTerm})`,
      "",
      // No freight caveat on an overland offer: there is no sea freight to warn
      // about, and the team asked for that notice gone from the Russian market.
      ...(input.paymentTerms ? [`Оплата: ${input.paymentTerms}`] : []),
      `Предложение действительно ${QUOTE_VALID_DAYS} дней.`,
      "",
      WEBSITE,
    ].join("\n");
  }

  return [
    `*${BRAND}* — Price Offer`,
    "",
    `${emoji}*${productName}*`,
    `${containers} × ${CONTAINER_TYPE} · ${cartons} ${plural(unit)}`,
    `${qty(gwPerCarton, 1)} KG gross per ${unit}`,
    `ETD: ${formatEtd(input.etd)}`,
    "",
    // Omitted on a delivered-price market, which quotes one figure.
    ...(quote.fobPerCarton !== null ? [`*${baseTerm}* ${usd(quote.fobPerCarton)}/${unit}`] : []),
    `*${deliveredTerm}* ${usd(quote.cifPerCarton)}/${unit}`,
    `= ${usd0(quote.quotedPerMT)} per MT`,
    `*Total* ${usd0(quote.quotedTotal)} (${deliveredTerm})`,
    "",
    ...(input.paymentTerms ? [`Payment: ${input.paymentTerms}`, ""] : []),
    `Sea freight is unstable — CIF is re-confirmed at booking. FOB is firm for ${QUOTE_VALID_DAYS} days.`,
    "",
    WEBSITE,
  ].join("\n");
}

/** Brand block, exported so the screen and the quote text cannot drift apart. */
export const QUOTE_BRAND = { name: BRAND, website: WEBSITE, email: EMAIL, phone: PHONE };
