/**
 * How old a cost is, and whether that matters.
 *
 * Costs on this sheet age at very different rates: the farm price moves every
 * few days, sea freight roughly weekly, and customs / inland / bank charges
 * hardly at all. A single "last updated" stamp on the sheet would therefore say
 * nothing useful — the flag has to be per line, against that line's own window.
 *
 * The failure this prevents: re-quoting from a saved sheet whose farm price is
 * two weeks stale, which reads as a normal quote and is wrong by whatever the
 * market moved.
 */

import type { CostLine, LineFreshness } from "@/types/quote";
import { isFixedLine } from "./defaults";

/** Days a cost stays trustworthy, by line. */
const STALE_AFTER_DAYS: Record<string, number> = {
  farm: 3,
  freight: 7,
  packing: 30,
  customs: 90,
  inland: 90,
  bank: 90,
};

/** Added lines are one-off shipment charges — judged on the loose window. */
const DEFAULT_STALE_AFTER_DAYS = 90;

export function staleAfterDays(lineId: string): number {
  return isFixedLine(lineId) ? STALE_AFTER_DAYS[lineId] ?? DEFAULT_STALE_AFTER_DAYS : DEFAULT_STALE_AFTER_DAYS;
}

const MS_PER_DAY = 86_400_000;

/**
 * Null when there is nothing meaningful to date: an uncosted line (amount 0),
 * or a sheet saved before per-line timestamps existed. Callers render nothing
 * in that case rather than guessing an age.
 */
export function lineFreshness(line: CostLine, now: Date = new Date()): LineFreshness | null {
  if (line.amount <= 0 || !line.updatedAt) return null;

  const then = new Date(line.updatedAt);
  if (isNaN(then.getTime())) return null;

  // Whole calendar days, so a value entered yesterday evening reads "yesterday"
  // rather than "today" just because fewer than 24 hours have passed.
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / MS_PER_DAY));

  return {
    days,
    stale: days > staleAfterDays(line.id),
    at: then,
  };
}

/** Past a fortnight the exact count stops helping — show the date instead. */
export const AGE_EXACT_DAYS = 14;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Stamps `updatedAt` when the amount actually changed — not on a relabel or unit switch. */
export function stampIfAmountChanged(prev: CostLine, next: CostLine, now: Date = new Date()): CostLine {
  if (next.amount === prev.amount) return next;
  return { ...next, updatedAt: now.toISOString() };
}
