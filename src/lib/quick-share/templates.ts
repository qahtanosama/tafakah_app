import type { BuyerLanguage } from "@/types/buyer";
import { toArabicFormatted, toArabicDigits } from "@/lib/arabic";

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

export interface TemplateVars {
  buyerName: string;
  contractNo: string;
  productList: string;
  /** MTS quantity as a plain number; formatting done by renderTemplate based on language */
  totalQty: number;
  /** ISO date string (yyyy-mm-dd) or pre-formatted fallback */
  etd: string;
  /** Pre-formatted bullet list (one per line, starting with "• ") */
  docList: string;
}

function formatEtd(iso: string, lang: BuyerLanguage): string {
  if (!iso) return lang === "ar" ? "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F" : "TBD";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const en = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return lang === "ar" ? toArabicDigits(en) : en;
}

function formatQty(mts: number, lang: BuyerLanguage): string {
  if (lang === "ar") {
    return `${toArabicFormatted(mts, mts % 1 === 0 ? 0 : 2)} \u0637\u0646`;
  }
  const pretty = mts.toLocaleString("en-US", {
    minimumFractionDigits: mts % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${pretty} MT`;
}

/** Replace {buyerName}, {contractNo}, {productList}, {totalQty}, {etd}, {docList} in the template. */
export function renderTemplate(
  template: string,
  vars: TemplateVars,
  lang: BuyerLanguage = "en"
): string {
  const replacements: Record<string, string> = {
    "{buyerName}": vars.buyerName,
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

/** Pick the right template: custom override > default for language */
export function resolveTemplate(
  lang: BuyerLanguage,
  custom?: { en?: string; ar?: string }
): string {
  const override = custom?.[lang]?.trim();
  if (override) return override;
  return lang === "ar" ? DEFAULT_TEMPLATE_AR : DEFAULT_TEMPLATE_EN;
}
