import type { BuyerLanguage } from "@/types/buyer";
import type { SellerLanguage } from "@/types/seller";
import { toArabicFormatted, toArabicDigits } from "@/lib/arabic";

/** Any supported template language across buyer and seller templates. */
export type TemplateLanguage = "en" | "ar" | "zh";

/* ───────────────────────── BUYER TEMPLATES ───────────────────────── */

export const DEFAULT_TEMPLATE_EN = `Dear {buyerName},

Please find attached the documents for contract {contractNo}:
{docList}

Shipment details:
- Product: {productList}
- Quantity: {totalQty}
- ETD: {etd}

Kindly confirm receipt.

Best regards,
Sam
TAFAKAH Food (Shanghai) Co., Ltd.`;

export const DEFAULT_TEMPLATE_AR = `\u0627\u0644\u0633\u064A\u062F/\u0629 {buyerName} \u0627\u0644\u0645\u062D\u062A\u0631\u0645/\u0629\u060C

\u062A\u062C\u062F\u0648\u0646 \u0637\u064A\u0647 \u0645\u0633\u062A\u0646\u062F\u0627\u062A \u0627\u0644\u0639\u0642\u062F \u0631\u0642\u0645 {contractNo}:
{docList}

\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0634\u062D\u0646\u0629:
- \u0627\u0644\u0645\u0646\u062A\u062C: {productList}
- \u0627\u0644\u0643\u0645\u064A\u0629: {totalQty}
- \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0634\u062D\u0646: {etd}

\u0646\u0631\u062C\u0648 \u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645.

\u0645\u0639 \u0623\u0637\u064A\u0628 \u0627\u0644\u062A\u062D\u064A\u0627\u062A\u060C
\u0633\u0627\u0645
\u062A\u0641\u0643\u0647 \u0644\u0644\u0623\u063A\u0630\u064A\u0629 (\u0634\u0646\u063A\u0647\u0627\u064A) \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629`;

/* ───────────────────────── SELLER TEMPLATES ───────────────────────── */

export const DEFAULT_SELLER_TEMPLATE_EN = `Dear {contactName},

Please find attached the documents for contract {contractNo}:
{docList}

Order details:
- Product: {productList}
- Quantity: {totalQty}
- Required ETD: {etd}

Please confirm receipt and production schedule.

Best regards,
Sam
TAFAKAH Food (Shanghai) Co., Ltd.`;

export const DEFAULT_SELLER_TEMPLATE_AR = `\u0627\u0644\u0623\u062E \u0627\u0644\u0643\u0631\u064A\u0645 {contactName}\u060C

\u062A\u062C\u062F\u0648\u0646 \u0637\u064A\u0647 \u0645\u0633\u062A\u0646\u062F\u0627\u062A \u0627\u0644\u0639\u0642\u062F \u0631\u0642\u0645 {contractNo}:
{docList}

\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0637\u0644\u0628\u064A\u0629:
- \u0627\u0644\u0645\u0646\u062A\u062C: {productList}
- \u0627\u0644\u0643\u0645\u064A\u0629: {totalQty}
- \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0634\u062D\u0646 \u0627\u0644\u0645\u0637\u0644\u0648\u0628: {etd}

\u0646\u0631\u062C\u0648 \u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0648\u062C\u062F\u0648\u0644 \u0627\u0644\u0625\u0646\u062A\u0627\u062C.

\u0645\u0639 \u0623\u0637\u064A\u0628 \u0627\u0644\u062A\u062D\u064A\u0627\u062A\u060C
\u0633\u0627\u0645
\u062A\u0641\u0643\u0647 \u0644\u0644\u0623\u063A\u0630\u064A\u0629 (\u0634\u0646\u063A\u0647\u0627\u064A) \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629`;

export const DEFAULT_SELLER_TEMPLATE_ZH = `{contactName} \u60A8\u597D\uFF0C

\u9644\u4EF6\u4E3A\u5408\u540C\u7F16\u53F7 {contractNo} \u7684\u76F8\u5173\u6587\u4EF6\uFF1A
{docList}

\u8BA2\u5355\u8BE6\u60C5\uFF1A
- \u4EA7\u54C1\uFF1A{productList}
- \u6570\u91CF\uFF1A{totalQty}
- \u8981\u6C42\u53D1\u8D27\u65E5\u671F\uFF1A{etd}

\u8BF7\u786E\u8BA4\u6536\u5230\u5E76\u544A\u77E5\u751F\u4EA7\u8BA1\u5212\u3002

\u6B64\u81F4
\u656C\u793C
Sam
\u6CF0\u798F\u51EF\u98DF\u54C1\u8D38\u6613\uFF08\u4E0A\u6D77\uFF09\u6709\u9650\u516C\u53F8`;

/* ───────────────────────── TEMPLATE VARS ───────────────────────── */

export interface TemplateVars {
  /** Buyer company/contact name (for buyer templates) */
  buyerName?: string;
  /** Seller contact name (for seller templates) */
  contactName?: string;
  /** Seller company name (for seller templates) */
  sellerName?: string;
  contractNo: string;
  productList: string;
  /** MTS quantity as a plain number; formatting done by renderTemplate based on language */
  totalQty: number;
  /** ISO date string (yyyy-mm-dd) or pre-formatted fallback */
  etd: string;
  /** Pre-formatted bullet list (one per line, starting with "• ") */
  docList: string;
}

function formatEtd(iso: string, lang: TemplateLanguage): string {
  if (!iso) {
    if (lang === "ar") return "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F";
    if (lang === "zh") return "\u5F85\u5B9A";
    return "TBD";
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const en = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (lang === "ar") return toArabicDigits(en);
  // zh keeps Western digits by design
  return en;
}

function formatQty(mts: number, lang: TemplateLanguage): string {
  if (lang === "ar") {
    return `${toArabicFormatted(mts, mts % 1 === 0 ? 0 : 2)} \u0637\u0646`;
  }
  const pretty = mts.toLocaleString("en-US", {
    minimumFractionDigits: mts % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (lang === "zh") return `${pretty} \u5428`;
  return `${pretty} MT`;
}

/** Replace variables in the template. Supports buyer and seller placeholders. */
export function renderTemplate(
  template: string,
  vars: TemplateVars,
  lang: TemplateLanguage = "en"
): string {
  const replacements: Record<string, string> = {
    "{buyerName}": vars.buyerName ?? "",
    "{contactName}": vars.contactName ?? "",
    "{sellerName}": vars.sellerName ?? "",
    "{contractNo}": vars.contractNo,
    "{productList}": vars.productList,
    "{totalQty}": formatQty(vars.totalQty, lang),
    "{etd}": formatEtd(vars.etd, lang),
    "{docList}": vars.docList,
  };
  let out = template;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }
  return out;
}

/** Pick the right BUYER template: custom override > default for language. Keeps legacy BuyerLanguage type. */
export function resolveTemplate(
  lang: BuyerLanguage,
  custom?: { en?: string; ar?: string }
): string {
  const override = custom?.[lang]?.trim();
  if (override) return override;
  return lang === "ar" ? DEFAULT_TEMPLATE_AR : DEFAULT_TEMPLATE_EN;
}

/** Pick the right SELLER template: custom override > default for language. */
export function resolveSellerTemplate(
  lang: SellerLanguage,
  custom?: { en?: string; ar?: string; zh?: string }
): string {
  const override = custom?.[lang]?.trim();
  if (override) return override;
  if (lang === "ar") return DEFAULT_SELLER_TEMPLATE_AR;
  if (lang === "zh") return DEFAULT_SELLER_TEMPLATE_ZH;
  return DEFAULT_SELLER_TEMPLATE_EN;
}
