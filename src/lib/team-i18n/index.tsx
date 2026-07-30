"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { dictionaries, en } from "./dictionary";
import {
  type TeamLocale,
  getLocaleSnapshot,
  getServerLocaleSnapshot,
  setTeamLocale,
  subscribeLocale,
} from "./locale-store";

export type { TeamLocale };
export { setTeamLocale };

type Section = keyof typeof en;
type KeyOf<S extends Section> = keyof (typeof en)[S];

/**
 * Translator for one section of the dictionary.
 *
 *   const t = useT("calc");
 *   t("landedCost")                  -> "Landed cost" / "总成本"
 *   t("noRate", { currency: "RMB" }) -> "no RMB rate" / "缺少RMB汇率"
 *
 * Falls back to English for any key a translation is missing, so a gap shows the
 * English word rather than a raw key. TypeScript makes that unreachable for the
 * shipped locales, but a hand-edited dictionary should still degrade readably.
 */
export function useT<S extends Section>(section: S) {
  const { locale } = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getServerLocaleSnapshot);

  return useCallback(
    (key: KeyOf<S>, params?: Record<string, string | number>): string => {
      const table = (dictionaries[locale] ?? en) as Record<string, Record<string, string>>;
      const raw = table[section]?.[key as string] ?? (en[section] as Record<string, string>)[key as string] ?? String(key);
      return params ? interpolate(raw, params) : raw;
    },
    [locale, section]
  );
}

/** The active locale, for the few places that need to branch on it. */
export function useTeamLocale(): TeamLocale {
  return useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getServerLocaleSnapshot).locale;
}

/**
 * Locale-aware date and number formatting, so a Chinese screen does not print
 * "Jul 12" beside translated labels.
 */
export function useTeamFormat() {
  const locale = useTeamLocale();
  const tag = locale === "zh" ? "zh-CN" : "en-US";
  return useMemo(
    () => ({
      monthDay: (d: Date) => new Intl.DateTimeFormat(tag, { month: "short", day: "numeric" }).format(d),
      monthYear: (d: Date) => new Intl.DateTimeFormat(tag, { month: "short", year: "numeric" }).format(d),
    }),
    [tag]
  );
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
  );
}
