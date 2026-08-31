"use client";

import { AlertTriangle, Check, Copy, Eye, Info, SendHorizontal } from "lucide-react";
import type { FxRates, MarginScenario, Quote } from "@/types/quote";
import { Button } from "@/components/ui/button";
import { MARGIN_MAX, MARGIN_MIN } from "@/lib/quote/defaults";
import { convertFromUSD } from "@/lib/quote/pricing";
import { qty, usd, usd0 } from "@/lib/money";
import type { QuoteIssue } from "@/types/quote";
import type { QuoteLang } from "@/lib/quote/storage";
import { cn } from "@/lib/utils";
import { useT, useTeamFormat } from "@/lib/team-i18n";

/**
 * Issue code -> dictionary key. The pricing layer reports which problem a quote
 * has; the wording lives here, so the same calculation explains itself in
 * whichever language the person reading it uses.
 */
const ISSUE_KEY = {
  noProduct: "issueNoProduct",
  containers: "issueContainers",
  cartons: "issueCartons",
  netWeight: "issueNetWeight",
  grossWeight: "issueGrossWeight",
  noFx: "issueNoFx",
  farmZero: "issueFarmZero",
  uncosted: "issueUncosted",
  marginCapped: "issueMarginCapped",
  weightsSwapped: "issueWeightsSwapped",
  unnamedLine: "issueUnnamedLine",
  noEtd: "issueNoEtd",
} as const satisfies Record<QuoteIssue["code"], string>;

interface Props {
  quote: Quote;
  scenarios: MarginScenario[];
  marginPct: number;
  onMarginChange: (marginPct: number) => void;
  fx: FxRates;
  lang: QuoteLang;
  onLangChange: (lang: QuoteLang) => void;
  onPreview: () => void;
  onCopy: () => void;
  onSendToMaster: () => void;
  copied: boolean;
  /** The letterhead offer PDF button — passed in so this panel stays render-only. */
  offerPdf?: React.ReactNode;
}

/**
 * What we sell at. The price per MT is the number the whole screen exists to
 * produce, so it is the largest thing on the page and sits above the fold in
 * the sticky column — not below a re-listing of the costs, which the sheet on
 * the left already itemises.
 */
export default function PricePanel({
  quote,
  scenarios,
  marginPct,
  onMarginChange,
  fx,
  lang,
  onLangChange,
  onPreview,
  onCopy,
  onSendToMaster,
  copied,
  offerPdf,
}: Props) {
  const t = useT("calc");
  const errors = quote.issues.filter((i) => i.level === "error");
  const warnings = quote.issues.filter((i) => i.level === "warning");
  const blocked = !quote.ready;

  // Most buyers are Saudi and negotiate per box, so the carton price is the one
  // worth restating in riyal — a per-MT figure in SAR is not a number anyone
  // quotes. The peg makes this a restatement of the same price, not a second
  // currency we sell in: the quote text stays USD.
  const sarPerCarton = convertFromUSD(quote.quotedPerCarton, "SAR", fx);
  const sarTotal = convertFromUSD(quote.quotedTotal, "SAR", fx);

  return (
    <section
      aria-labelledby="price-panel-heading"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
        <h2 id="price-panel-heading" className="font-heading text-base font-semibold">
          {t("sellAt")}
        </h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">{t("marginSuffix", { margin: quote.marginPct })}</span>
      </div>

      {/* Hero price. Dimmed rather than hidden while blocked — the layout must
          not jump once the inputs are complete. */}
      <div className={cn("px-5 pt-3 pb-5", blocked && "opacity-45")}>
        <dl>
          <dt className="text-sm text-slate-600 dark:text-slate-400">{t("cifPricePerMt")}</dt>
          <dd className="mt-0.5 font-mono text-[2.75rem] leading-none font-semibold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-400">
            {usd0(quote.quotedPerMT)}
          </dd>

          {/* Per box, split the way the quote states it. Margin sits on FOB and
              freight is passed at cost, so CIF − FOB is exactly the freight —
              the number to restate when the rate moves. */}
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/5">
            {/* A delivered-price market has no base price and no pass-through
                carriage to show beneath it — see Quote.fobPerCarton. */}
            {quote.fobPerCarton !== null && (
              <>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-slate-600 dark:text-slate-400">{t("fobPerCarton")}</dt>
                  <dd className="font-mono font-semibold tabular-nums">{usd(quote.fobPerCarton)}</dd>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-slate-600 dark:text-slate-400">
                    {t("plusSeaFreight")} <span className="text-xs">{t("atCost")}</span>
                  </dt>
                  <dd className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {usd(quote.freightPerCarton)}
                  </dd>
                </div>
              </>
            )}
            <div
              className={cn(
                "flex items-baseline justify-between gap-3 text-sm",
                quote.fobPerCarton !== null && "mt-1.5 border-t border-foreground/10 pt-1.5"
              )}
            >
              <dt className="font-medium">{t("cifPerCarton")}</dt>
              <dd className="font-mono font-semibold tabular-nums">{usd(quote.cifPerCarton)}</dd>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-slate-600 dark:text-slate-400">{t("totalCif")}</dt>
              <dd className="font-mono font-medium tabular-nums">{usd0(quote.quotedTotal)}</dd>
            </div>
            {quote.fobTotal !== null && (
              <div>
                <dt className="text-slate-600 dark:text-slate-400">{t("totalFob")}</dt>
                <dd className="font-mono font-medium tabular-nums">{usd0(quote.fobTotal)}</dd>
              </div>
            )}
            <div className="col-span-2 flex items-baseline justify-between border-t border-foreground/10 pt-2">
              <dt className="text-slate-600 dark:text-slate-400">{t("profit")}</dt>
              <dd
                className={cn(
                  "font-mono font-semibold tabular-nums",
                  quote.profit < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {usd(quote.profit)}
              </dd>
            </div>

            {sarPerCarton !== null && sarTotal !== null && (
              <div className="col-span-2 border-t border-foreground/10 pt-2">
                <dt className="text-slate-600 dark:text-slate-400">
                  {t("inRiyal")} <span className="text-xs">· {t("riyalRate", { rate: fx.SAR })}</span>
                </dt>
                <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono tabular-nums">
                  <span className="font-semibold">SAR {qty(sarPerCarton, 2)}</span>
                  <span className="text-slate-600 dark:text-slate-400">{t("riyalPerCarton")}</span>
                  <span className="text-slate-600 dark:text-slate-400">
                    · {t("riyalTotal", { total: qty(sarTotal) })}
                  </span>
                </dd>
              </div>
            )}
          </div>
        </dl>
      </div>

      {/* Margin — the lever that gets dragged during a negotiation, so it sits
          with the price it moves rather than in a card of its own. */}
      <div className="border-t border-foreground/10 px-5 py-4">
        <div className="flex items-center gap-4">
          <label htmlFor="margin-range" className="text-sm font-medium">
            {t("margin")}
          </label>
          <input
            id="margin-range"
            type="range"
            min={MARGIN_MIN}
            max={MARGIN_MAX}
            step={1}
            value={marginPct}
            onChange={(e) => onMarginChange(parseInt(e.target.value, 10))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none dark:bg-zinc-700"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              min={MARGIN_MIN}
              max={MARGIN_MAX}
              value={marginPct}
              aria-label={t("marginPercentA11y")}
              onChange={(e) => onMarginChange(parseInt(e.target.value, 10))}
              className="h-9 w-16 rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-sm tabular-nums outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-zinc-800/60"
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">%</span>
          </div>
        </div>

        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">{t("scenariosCaption")}</caption>
          <thead>
            <tr className="text-xs text-slate-500 dark:text-slate-400">
              <th scope="col" className="pb-1 text-left font-medium">
                {t("scMargin")}
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                {t("scPerMt")}
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                {t("scPerCarton")}
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                {t("scTotal")}
              </th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              const active = s.marginPct === quote.marginPct;
              return (
                <tr
                  key={s.marginPct}
                  className={cn(
                    "border-t border-foreground/5",
                    active
                      ? "font-semibold text-emerald-800 dark:text-emerald-300"
                      : "text-slate-600 dark:text-slate-400"
                  )}
                >
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => onMarginChange(s.marginPct)}
                      aria-pressed={active}
                      className="rounded px-1 tabular-nums transition-colors hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none dark:hover:text-emerald-300"
                    >
                      {s.marginPct}%
                    </button>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{usd0(s.perMT)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{usd(s.perCarton)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{usd0(s.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="border-t border-foreground/10 px-5 py-4">
          <ul className="space-y-1.5 text-sm">
            {errors.map((issue) => (
              <li key={issue.code} className="flex gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t(ISSUE_KEY[issue.code], issue.params)}</span>
              </li>
            ))}
            {warnings.map((issue) => (
              <li key={issue.code} className="flex gap-2 text-amber-700 dark:text-amber-400">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t(ISSUE_KEY[issue.code], issue.params)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-foreground/10 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label={t("quoteLanguage")}
            className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-800"
          >
            {(["en", "ar"] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onLangChange(code)}
                aria-pressed={lang === code}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none",
                  lang === code
                    ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-600 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                {code === "en" ? t("langEn") : t("langAr")}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onPreview} disabled={blocked}>
              <Eye aria-hidden="true" />
              {t("preview")}
            </Button>
            {offerPdf}
            <Button variant="outline" size="sm" onClick={onSendToMaster} disabled={blocked}>
              <SendHorizontal aria-hidden="true" />
              {t("toContract")}
            </Button>
            {/* Copy is the primary action: pasting the quote into WhatsApp or
                email is what this screen is for. */}
            <Button size="sm" onClick={onCopy} disabled={blocked}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? t("copied") : t("copyQuote")}
            </Button>
          </div>
        </div>
        {blocked && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t("blockedHint")}
          </p>
        )}
      </div>
    </section>
  );
}

interface HistoryProps {
  rows: { buyer: string; priceMT: number; date: string; diffPct: number }[];
  quotedPerMT: number;
}

/**
 * What this product last went out at, and how today's number compares. Lives
 * inside the price column because it only means anything next to the price.
 */
export function PriceHistory({ rows, quotedPerMT }: HistoryProps) {
  const t = useT("calc");
  const fmt = useTeamFormat();
  if (rows.length === 0) return null;

  return (
    <section
      aria-labelledby="price-history-heading"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <h2 id="price-history-heading" className="px-5 pt-4 font-heading text-base font-semibold">
        {t("lastQuoted")}
      </h2>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">{t("lastQuotedCaption")}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{t("lqBuyer")}</th>
            <th scope="col">{t("lqDate")}</th>
            <th scope="col">{t("lqPrice")}</th>
            <th scope="col">{t("lqDiff")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.buyer} className="border-t border-foreground/5">
              <td className="py-2 pr-2 pl-5 font-medium">{r.buyer}</td>
              <td className="py-2 pr-2 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                {formatMonth(r.date, fmt)}
              </td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums">{usd0(r.priceMT)}</td>
              <td className="py-2 pr-5 text-right whitespace-nowrap">
                {quotedPerMT > 0 ? <DiffBadge diffPct={r.diffPct} sameLabel={t("lqSame")} /> : <span className="text-slate-500">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-5 pt-1 pb-4 text-xs text-slate-500 dark:text-slate-400">
        {t("lqFoot")}
      </p>
    </section>
  );
}

/**
 * Signed text, not colour alone — as the seller, quoting above a past price is
 * the good direction, which is the opposite of what a red/green reflex reads.
 */
function DiffBadge({ diffPct, sameLabel }: { diffPct: number; sameLabel: string }) {
  const rounded = Math.abs(diffPct) < 0.05 ? 0 : diffPct;
  if (rounded === 0) return <span className="font-mono text-xs text-slate-500">{sameLabel}</span>;
  return (
    <span className="font-mono text-xs font-medium tabular-nums text-slate-700 dark:text-slate-300">
      {rounded > 0 ? "+" : "−"}
      {qty(Math.abs(rounded), 1)}%
    </span>
  );
}

function formatMonth(date: string, fmt: ReturnType<typeof useTeamFormat>): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return fmt.monthYear(d);
}
