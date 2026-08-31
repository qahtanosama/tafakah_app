// Standard two-part payment terms for the Sales Contract (clause 6).
// Pure module — shared by the PaymentTermsEditor (client) and the contract
// defaults (imported from server actions), so NO "use client" here.
//
// The stored value on terms.paymentTerms stays a plain string:
//   • 50% advance payment (deposit) upon signing of this contract / before shipment.
//   • 50% balance to be paid before arrival of the goods at Jeddah Port,
//     within 7–10 days (against copy of the Bill of Lading and shipping documents).

export const DEPOSIT_TIMINGS = [
  "upon signing of this contract / before shipment",
  "upon signing of this contract",
  "before shipment",
] as const;

export interface StandardPaymentTerms {
  advancePct: number;
  depositTiming: string;
  port: string;
  balanceDays: string;
}

export const DEFAULT_PAYMENT_TERMS: StandardPaymentTerms = {
  advancePct: 50,
  depositTiming: DEPOSIT_TIMINGS[0],
  port: "Jeddah Port",
  balanceDays: "7–10 days",
};

export function composePaymentTerms(t: StandardPaymentTerms): string {
  const balance = 100 - t.advancePct;
  return (
    `• ${t.advancePct}% advance payment (deposit) ${t.depositTiming}.\n` +
    `• ${balance}% balance to be paid before arrival of the goods at ${t.port}, ` +
    `within ${t.balanceDays} (against copy of the Bill of Lading and shipping documents).`
  );
}

const STANDARD_RE =
  /^•\s*(\d{1,3})%\s*advance payment \(deposit\)\s*([^\n]+?)\.\s*\n•\s*\d{1,3}%\s*balance to be paid before arrival of the goods at\s*(.+?),\s*within\s*(.+?)\s*\(against copy of the Bill of Lading and shipping documents\)\.?\s*$/;

/** Returns the structured fields when the string matches the standard wording, else null. */
export function parsePaymentTerms(value: string): StandardPaymentTerms | null {
  const m = value.trim().match(STANDARD_RE);
  if (!m) return null;
  const advancePct = parseInt(m[1], 10);
  if (!Number.isFinite(advancePct) || advancePct < 0 || advancePct > 100) return null;
  return { advancePct, depositTiming: m[2].trim(), port: m[3].trim(), balanceDays: m[4].trim() };
}

/** "JEDDAH PORT, SAUDI ARABIA" → "Jeddah Port" (first segment, title case). */
export function portFromDischarge(dischargePort: string): string {
  const first = dischargePort.split(",")[0]?.trim() ?? "";
  if (!first) return "";
  return first
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/* ── Quote presets ──────────────────────────────────────────────────────────
 *
 * The standing options the Quote Calculator offers. Distinct from the
 * structured StandardPaymentTerms above, which stays the Sales Contract's own
 * editable two-part form — nothing already signed changes.
 *
 * Every preset says "copy of shipping documents", never "Bill of Lading". A
 * B/L is a sea document; the Khorgos route moves on a CMR or a rail waybill,
 * so citing a B/L there names a document that will never exist. The neutral
 * wording is true of a vessel and a truck alike, which is what lets one list
 * serve both markets.
 *
 * TWO LABEL SETS, deliberately. `label` is the team-facing picker text and
 * follows the app shell's languages (en/zh). `text` is what the BUYER reads and
 * follows the quote languages (en/ar/ru). Chinese never reaches buyer output —
 * see lib/team-i18n and lib/quote/quote-text.
 */

export const PAYMENT_TERM_IDS = [
  "advance100",
  "a30l70",
  "a30d70",
  "a50b50",
  "docs100",
  "cad",
  "lc",
] as const;
export type PaymentTermId = (typeof PAYMENT_TERM_IDS)[number];

export interface PaymentTermOption {
  id: PaymentTermId;
  /** Picker label, in the team app's languages. */
  label: { en: string; zh: string };
  /** What the buyer reads, in the quote's language. */
  text: { en: string; ar: string; ru: string };
  /** Clause 6 wording handed to the Sales Contract. */
  contract: string;
}

export const PAYMENT_TERMS: PaymentTermOption[] = [
  {
    id: "advance100",
    label: { en: "100% in advance", zh: "100% 预付" },
    text: {
      en: "100% T/T in advance, before shipment",
      ar: "100% تحويل بنكي مقدماً قبل الشحن",
      ru: "100% предоплата банковским переводом до отгрузки",
    },
    contract: "• 100% advance payment (T/T) before shipment.",
  },
  {
    id: "a30l70",
    label: { en: "30% advance / 70% after loading", zh: "30% 预付 / 70% 装柜后" },
    text: {
      en: "30% advance, 70% after loading the container",
      ar: "30% مقدماً، 70% بعد تحميل الحاوية",
      ru: "30% предоплата, 70% после погрузки контейнера",
    },
    contract:
      "• 30% advance payment (deposit) upon signing of this contract.\n" +
      "• 70% balance to be paid after loading of the container, against copy of shipping documents.",
  },
  {
    id: "a30d70",
    label: { en: "30% advance / 70% against documents", zh: "30% 预付 / 70% 凭单据" },
    text: {
      en: "30% advance, 70% against copy of shipping documents",
      ar: "30% مقدماً، 70% مقابل نسخة من مستندات الشحن",
      ru: "30% предоплата, 70% против копий отгрузочных документов",
    },
    contract:
      "• 30% advance payment (deposit) upon signing of this contract.\n" +
      "• 70% balance to be paid against copy of shipping documents.",
  },
  {
    id: "a50b50",
    label: { en: "50% advance / 50% before arrival", zh: "50% 预付 / 50% 到货前" },
    text: {
      en: "50% advance, 50% before arrival of the goods",
      ar: "50% مقدماً، 50% قبل وصول البضاعة",
      ru: "50% предоплата, 50% до прибытия груза",
    },
    contract:
      "• 50% advance payment (deposit) upon signing of this contract / before shipment.\n" +
      "• 50% balance to be paid before arrival of the goods, against copy of shipping documents.",
  },
  {
    id: "docs100",
    label: { en: "100% against documents", zh: "100% 凭单据付款" },
    text: {
      en: "100% against copy of shipping documents",
      ar: "100% مقابل نسخة من مستندات الشحن",
      ru: "100% против копий отгрузочных документов",
    },
    contract: "• 100% payment against copy of shipping documents.",
  },
  {
    id: "cad",
    label: { en: "Cash against documents (CAD)", zh: "凭单付款（CAD）" },
    text: {
      en: "Cash against documents (CAD)",
      ar: "الدفع مقابل المستندات (CAD)",
      ru: "Оплата против документов (CAD)",
    },
    contract: "• Cash against documents (CAD).",
  },
  {
    id: "lc",
    label: { en: "Irrevocable L/C at sight", zh: "不可撤销即期信用证" },
    text: {
      en: "Irrevocable L/C at sight",
      ar: "اعتماد مستندي غير قابل للإلغاء بالاطلاع",
      ru: "Безотзывный аккредитив по предъявлении",
    },
    contract: "• Irrevocable Letter of Credit (L/C) at sight.",
  },
];

/**
 * What a fresh quote offers. Matches the Sales Contract's own 50/50 default so
 * a quote and the contract that follows it do not disagree by accident.
 */
export const DEFAULT_PAYMENT_TERM_ID: PaymentTermId = "a50b50";

/** The option for an id, or the default when the id is unknown or unset. */
export function paymentTermById(id: string | undefined | null): PaymentTermOption {
  return (
    PAYMENT_TERMS.find((t) => t.id === id) ??
    PAYMENT_TERMS.find((t) => t.id === DEFAULT_PAYMENT_TERM_ID)!
  );
}
