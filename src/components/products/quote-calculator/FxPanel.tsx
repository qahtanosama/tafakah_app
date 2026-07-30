"use client";

import { ChevronDown } from "lucide-react";
import type { FxRates } from "@/types/quote";
import { DEFAULT_FX } from "@/lib/quote/defaults";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/team-i18n";
import { NumberField } from "./fields";

interface Props {
  fx: FxRates;
  onChange: (patch: Partial<FxRates>) => void;
  open: boolean;
  onToggle: () => void;
  /** Currencies actually used by a cost line — those rates are summarised in the header. */
  usedCurrencies: (keyof FxRates)[];
}

/**
 * Exchange rates. Collapsed by default because they change a few times a
 * quarter, not per quote — but the rates the current quote actually depends on
 * are shown in the closed header, so a wrong rate is visible without opening
 * anything. Silently converting at a stale rate is how a quote goes out wrong.
 */
export default function FxPanel({ fx, onChange, open, onToggle, usedCurrencies }: Props) {
  const t = useT("calc");
  const codes = Object.keys(DEFAULT_FX) as (keyof FxRates)[];

  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:hover:bg-white/5"
        >
          <span className="text-sm font-semibold">{t("exchangeRates")}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
            {usedCurrencies.length > 0
              ? usedCurrencies.map((c) => `1 USD = ${fx[c] || "—"} ${c}`).join("  ·  ")
              : t("usdOnly")}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </button>
      </h2>

      {open && (
        <div className="grid gap-2 border-t border-foreground/10 px-4 py-3 sm:grid-cols-2">
          {codes.map((code) => {
            const invalid = !Number.isFinite(fx[code]) || fx[code] <= 0;
            return (
              <label key={code} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-slate-600 dark:text-slate-400">1 USD =</span>
                <NumberField
                  label={t("usdTo", { currency: code })}
                  value={fx[code]}
                  onChange={(v) => onChange({ [code]: v } as Partial<FxRates>)}
                  className={cn(invalid && "border-red-400 dark:border-red-500/60")}
                />
                <span className="w-10 shrink-0 font-medium text-slate-700 dark:text-slate-300">{code}</span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
