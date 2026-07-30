"use client";

import { Languages } from "lucide-react";
import { setTeamLocale, useT, useTeamLocale } from "@/lib/team-i18n";
import { cn } from "@/lib/utils";

/**
 * EN / 中文 switch for the team app, per person.
 *
 * Two options, so a segmented control beats a dropdown — the choice and its
 * alternative are both visible and one click apart. The icon carries the meaning
 * for anyone who cannot read the label they are currently stuck on.
 */
export default function LanguageToggle() {
  const locale = useTeamLocale();
  const t = useT("common");

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-800"
    >
      <Languages className="ml-1 h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      {(["en", "zh"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setTeamLocale(code)}
          aria-pressed={locale === code}
          lang={code === "zh" ? "zh-CN" : "en"}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none",
            locale === code
              ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-600 dark:text-white"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          {code === "en" ? "EN" : "中文"}
        </button>
      ))}
    </div>
  );
}
