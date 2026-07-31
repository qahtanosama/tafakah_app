"use client";

import { AlertTriangle, Plus, X } from "lucide-react";
import type { CostLine, CostUnit, Currency, PricedLine, Quote } from "@/types/quote";
import { CURRENCIES, UNITS, USD_EXPECTED_LINES, isFixedLine } from "@/lib/quote/defaults";
import { AGE_EXACT_DAYS, lineFreshness, staleAfterDays } from "@/lib/quote/freshness";
import { qty, usd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useT, useTeamFormat } from "@/lib/team-i18n";
import { NumberField, SelectField, TextField } from "./fields";

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

/**
 * Dictionary key per standing line. The label stored in Supabase is English
 * *data*, so a Chinese screen renders these six from their id rather than
 * translating stored text — nobody's saved row gets silently relabelled, and the
 * quote that goes to the buyer still says what it always said.
 */
const FIXED_LINE_KEY = {
  farm: "lineFarm",
  packing: "linePacking",
  freight: "lineFreight",
  customs: "lineCustoms",
  inland: "lineInland",
  bank: "lineBank",
} as const;

const UNIT_KEY = {
  per_kg: "unitPerKg",
  per_carton: "unitPerCarton",
  per_container: "unitPerContainer",
  per_mt: "unitPerMt",
  flat: "unitFlat",
} as const;

/** Noun for the "× 19,400 cartons" multiplier. Null for a flat line, which has none. */
const FACTOR_KEY = {
  per_kg: "factorKg",
  per_carton: "factorCartons",
  per_container: "factorContainers",
  per_mt: "factorMt",
  flat: null,
} as const;

type CalcT = ReturnType<typeof useT<"calc">>;

/** Translated name for a line: dictionary for the six, user's own text otherwise. */
function lineName(line: CostLine, t: CalcT): string {
  const key = FIXED_LINE_KEY[line.id as keyof typeof FIXED_LINE_KEY];
  if (key) return t(key);
  return line.label.trim() || t("unnamedCost");
}

interface Props {
  lines: CostLine[];
  quote: Quote;
  /** Where these numbers came from — a copied or reopened sheet says so. */
  origin: "saved" | "copied" | "blank" | "reopened";
  reopenedFrom?: string;
  saving: boolean;
  saveError: boolean;
  onUpdate: (id: string, patch: Partial<CostLine>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  children?: React.ReactNode;
}

/**
 * Every cost of the shipment in one table — the six standing lines plus
 * whatever this shipment needed. One table, not two: splitting "main" from
 * "add-on" costs meant two headers, two subtotals and two mental models for
 * one addition, and it was the split that let the add-on half quietly lose its
 * unit dropdown.
 */
export default function CostSheet({
  lines,
  quote,
  origin,
  reopenedFrom,
  saving,
  saveError,
  onUpdate,
  onAdd,
  onRemove,
  children,
}: Props) {
  const t = useT("calc");
  const tc = useT("common");
  const priced = new Map(quote.lines.map((p) => [p.line.id, p]));

  return (
    <section
      aria-labelledby="cost-sheet-heading"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4 pb-3">
        <h2 id="cost-sheet-heading" className="font-heading text-base font-semibold">
          {t("costs")}
        </h2>
        <p
          aria-live="polite"
          className={cn(
            "text-xs",
            saveError ? "font-medium text-amber-700 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"
          )}
        >
          {saveError ? t("notSaving") : saving ? t("saving") : t("savedAuto")}
        </p>
      </div>

      <OriginNotice origin={origin} reopenedFrom={reopenedFrom} />

      {/* `relative` is load-bearing: sr-only text is position:absolute, so
          without a positioned ancestor it resolves against the viewport, sits
          at the table's full 38rem offset, and drags the whole page into
          horizontal scroll on a phone. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-sm">
          <caption className="sr-only">{t("costTableCaption")}</caption>
          <thead>
            <tr className="border-y border-foreground/10 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <th scope="col" className="py-2 pr-3 pl-4 text-left font-semibold">
                {t("colCost")}
              </th>
              <th scope="col" className="w-[6.5rem] px-1.5 py-2 text-right font-semibold">
                {t("colAmount")}
              </th>
              <th scope="col" className="w-[5rem] px-1.5 py-2 text-left font-semibold">
                {t("colCurrency")}
              </th>
              <th scope="col" className="w-[8.5rem] px-1.5 py-2 text-left font-semibold">
                {t("colPer")}
              </th>
              <th scope="col" className="w-[9rem] px-4 py-2 text-right font-semibold">
                {t("colUsd")}
              </th>
              <th scope="col" className="w-9">
                <span className="sr-only">{tc("delete")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <CostRow
                key={line.id}
                line={line}
                priced={priced.get(line.id)}
                onUpdate={(patch) => onUpdate(line.id, patch)}
                onRemove={isFixedLine(line.id) ? undefined : () => onRemove(line.id)}
              />
            ))}
            <tr>
              <td colSpan={6} className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={onAdd}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("addCostLine")}
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot className="border-t border-foreground/10">
            <tr className="bg-slate-50/80 dark:bg-white/5">
              <th scope="row" colSpan={4} className="py-2.5 pr-3 pl-4 text-left font-semibold">
                {t("landedCost")}
              </th>
              <td className="px-4 py-2.5 text-right font-mono text-base font-semibold tabular-nums">
                {usd(quote.landedCost)}
              </td>
              <td />
            </tr>
            <tr className="bg-slate-50/80 text-slate-600 dark:bg-white/5 dark:text-slate-400">
              <th scope="row" colSpan={4} className="pr-3 pb-1 pl-4 text-left font-normal">
                {t("perMt")}
              </th>
              <td className="px-4 pb-1 text-right font-mono tabular-nums">{usd(quote.costPerMT)}</td>
              <td />
            </tr>
            <tr className="bg-slate-50/80 text-slate-600 dark:bg-white/5 dark:text-slate-400">
              <th scope="row" colSpan={4} className="pr-3 pb-3 pl-4 text-left font-normal">
                {t("perCarton")}
              </th>
              <td className="px-4 pb-3 text-right font-mono tabular-nums">{usd(quote.costPerCarton)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {children}
    </section>
  );
}

function CostRow({
  line,
  priced,
  onUpdate,
  onRemove,
}: {
  line: CostLine;
  priced: PricedLine | undefined;
  onUpdate: (patch: Partial<CostLine>) => void;
  onRemove?: () => void;
}) {
  const t = useT("calc");
  const name = lineName(line, t);
  const unitOptions = UNITS.map((u) => ({ value: u.value, label: t(UNIT_KEY[u.value]) }));

  return (
    <tr className="border-b border-foreground/5 transition-colors last:border-b-0 hover:bg-slate-50/60 dark:hover:bg-white/[0.03]">
      <td className="py-2 pr-3 pl-4">
        {onRemove ? (
          <TextField
            label={t("costName")}
            value={line.label}
            onChange={(label) => onUpdate({ label })}
            placeholder={t("costNamePlaceholder")}
          />
        ) : (
          <span className="font-medium text-slate-700 dark:text-slate-200">{name}</span>
        )}
        <LineAge line={line} />
      </td>
      <td className="px-1.5 py-2">
        <NumberField
          label={t("amountOf", { name })}
          value={line.amount}
          onChange={(amount) => onUpdate({ amount })}
        />
      </td>
      <td className="px-1.5 py-2">
        <SelectField<Currency>
          label={t("currencyOf", { name })}
          value={line.currency}
          onChange={(currency) => onUpdate({ currency })}
          options={CURRENCY_OPTIONS}
        />
        {/* Freight and bank charges reach us as USD invoices. Entering one in
            RMB divides it by the FX rate and understates the cost, so say so
            right beside the field rather than letting it pass. */}
        {USD_EXPECTED_LINES.includes(line.id) && line.currency !== "USD" && (
          <span className="mt-0.5 block text-[11px] font-medium text-red-600 dark:text-red-400">
            {t("shouldBeUsd")}
          </span>
        )}
      </td>
      <td className="px-1.5 py-2">
        <SelectField<CostUnit>
          label={t("unitOf", { name })}
          value={line.unit}
          onChange={(unit) => onUpdate({ unit })}
          options={unitOptions}
        />
      </td>
      <td className="px-4 py-2 text-right">
        <LineTotal priced={priced} />
      </td>
      <td className="px-1 py-2 text-center">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("removeCost", { name })}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * Says where the numbers came from when they are not this product's own saved
 * sheet. Costs that arrived from another product look identical to costs
 * somebody checked, so the distinction has to be stated — silently inheriting a
 * freight rate is how a wrong one gets quoted.
 */
function OriginNotice({
  origin,
  reopenedFrom,
}: {
  origin: Props["origin"];
  reopenedFrom?: string;
}) {
  const t = useT("calc");
  if (origin === "saved") return null;

  const text =
    origin === "copied"
      ? t("originCopied")
      : origin === "reopened"
        ? t("originReopened", { date: reopenedFrom ?? "" })
        : t("originBlank");

  return (
    <p className="mx-4 mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">
      {text}
    </p>
  );
}

/**
 * When this cost was last touched, flagged amber once it is past its own
 * refresh window. Different costs go stale at very different rates — the farm
 * price within days, customs fees barely within a quarter — so a single sheet
 * timestamp would say nothing useful. Guards the real failure: re-quoting from
 * a saved sheet whose farm price is two weeks old.
 */
function LineAge({ line }: { line: CostLine }) {
  const t = useT("calc");
  const fmt = useTeamFormat();
  const age = lineFreshness(line);
  if (!age) return null;

  const label =
    age.days === 0
      ? t("ageToday")
      : age.days === 1
        ? t("ageYesterday")
        : age.days < AGE_EXACT_DAYS
          ? t("ageDays", { days: age.days })
          : fmt.monthDay(age.at);

  if (!age.stale) {
    return <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{label}</span>;
  }
  return (
    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label} {t("ageStaleSuffix")}
      <span className="sr-only">{t("ageStaleHint", { days: staleAfterDays(line.id) })}</span>
    </span>
  );
}

/**
 * The line's USD total, with the multiplier spelled out underneath. A flat $680
 * and a per-container $680 used to render identically on a 3-container quote,
 * which made a $1,360 error invisible to anyone checking the sheet.
 */
function LineTotal({ priced }: { priced: PricedLine | undefined }) {
  const t = useT("calc");
  if (!priced) return <span className="text-slate-500">—</span>;

  if (priced.usd === null) {
    return (
      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
        {t("noRate", { currency: priced.line.currency })}
      </span>
    );
  }
  if (priced.line.amount === 0) return <span className="text-slate-500">—</span>;

  const noun = FACTOR_KEY[priced.line.unit];

  return (
    <>
      <span className="block font-mono tabular-nums text-slate-800 dark:text-slate-200">
        {usd(priced.usd)}
      </span>
      {noun && (
        <span className="block font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-500">
          × {qty(priced.factor, priced.line.unit === "per_mt" ? 2 : 0)} {t(noun)}
        </span>
      )}
    </>
  );
}
