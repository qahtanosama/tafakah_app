"use client";

import { RotateCcw, X } from "lucide-react";
import type { CostSheet } from "@/types/quote";
import { todayKey } from "@/lib/data/cost-sheets";
import { usd0 } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Props {
  sessions: CostSheet[];
  /** Session date currently being viewed, when an older one is open. */
  reopenedFrom?: string;
  onReopen: (sheet: CostSheet) => void;
  onCloseReopened: () => void;
}

/**
 * Every costing this product has had, newest first — one entry per day it was
 * quoted. Reopening loads that day's costs so the team can see what changed or
 * re-quote from it, without overwriting today's sheet.
 *
 * The farm price is shown per row because it is the number that actually moves;
 * the rest of the sheet is close to constant, so a column of farm prices is the
 * honest summary of what made each quote different.
 */
export default function SessionHistory({ sessions, reopenedFrom, onReopen, onCloseReopened }: Props) {
  if (sessions.length === 0) return null;

  const today = todayKey();

  return (
    <section
      aria-labelledby="session-history-heading"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-1">
        <h2 id="session-history-heading" className="font-heading text-base font-semibold">
          Cost history
        </h2>
        {reopenedFrom && (
          <button
            type="button"
            onClick={onCloseReopened}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:text-indigo-400 dark:hover:bg-indigo-500/10"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Back to current
          </button>
        )}
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Saved cost sessions for this product, newest first</caption>
        <thead>
          <tr className="text-xs text-slate-500 dark:text-slate-400">
            <th scope="col" className="py-1 pr-2 pl-5 text-left font-medium">
              When
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">
              Farm
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">
              Quoted
            </th>
            <th scope="col" className="w-9 py-1 pr-4">
              <span className="sr-only">Reopen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const isToday = s.sessionDate === today;
            const viewing = reopenedFrom ? s.sessionDate === reopenedFrom : isToday;
            const farm = s.lines.find((l) => l.id === "farm");
            return (
              <tr
                key={s.id}
                className={cn(
                  "border-t border-foreground/5",
                  viewing && "bg-indigo-50/60 dark:bg-indigo-500/10"
                )}
              >
                <td className="py-2 pr-2 pl-5">
                  <span className={cn("font-medium", viewing && "text-indigo-800 dark:text-indigo-200")}>
                    {isToday ? "Today" : relativeDay(s.sessionDate)}
                  </span>
                  {viewing && (
                    <span className="ml-1.5 text-xs text-indigo-700 dark:text-indigo-300">· viewing</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {farm && farm.amount > 0 ? `${farm.amount} ${farm.currency}` : "—"}
                </td>
                <td className="py-2 pr-2 text-right font-mono tabular-nums">
                  {s.quotedPerMT ? `${usd0(s.quotedPerMT)}` : "—"}
                </td>
                <td className="py-2 pr-4 text-right">
                  {!viewing && (
                    <button
                      type="button"
                      onClick={() => onReopen(s)}
                      aria-label={`Reopen the costs from ${relativeDay(s.sessionDate)}`}
                      className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-indigo-400"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-5 pt-1.5 pb-4 text-xs text-slate-500 dark:text-slate-400">
        Saved automatically — one session per day. Reopening loads that day&rsquo;s costs.
      </p>
    </section>
  );
}

/** "Yesterday" / "3 days ago" / "Jul 12" — a date the reader can place. */
function relativeDay(sessionDate: string): string {
  // sessionDate is a plain YYYY-MM-DD; parse as local so it is not shifted a day
  // by the timezone offset the way new Date("2026-07-12") would be.
  const [y, m, d] = sessionDate.split("-").map(Number);
  if (!y || !m || !d) return sessionDate;
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - then.getTime()) / 86_400_000
  );

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(then);
}
