// Booking availability derived from a sailing's dates. Pure module — used by
// the team table, the portal cards, AND the submitLoadingPlan server action,
// so the portal can never submit a plan the UI would have flagged.
//
// Rules (team-set status wins over everything):
//   * status != open                    → unavailable
//   * keepOpen (team override)          → available even past the deadline
//   * booking deadline already passed   → unavailable
//   * deadline within TIGHT_WINDOW_DAYS → tight ("booking closes in Xd")
//   * otherwise                         → available
//
// The booking deadline is the cargo cut-off when the sheet provides one;
// otherwise it is ESTIMATED as ETD − 5 days (carrier norm for this trade —
// per the team, cut-off is usually five days before the ETD).

export const TIGHT_WINDOW_DAYS = 7;
export const DEFAULT_CUTOFF_DAYS_BEFORE_ETD = 5;

/** Shift a YYYY-MM-DD string by whole days (calendar math, timezone-free). */
function shiftIsoDays(iso: string, delta: number): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3] + delta);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The cargo cut-off used for display and booking decisions: the real one
 * when present, else derived from the ETD. `derived` lets the UI mark the
 * date as an estimate.
 */
export function effectiveCargoCutoff(s: {
  etd: string | null;
  cargoCutoff: string | null;
}): { date: string | null; derived: boolean } {
  if (s.cargoCutoff) return { date: s.cargoCutoff, derived: false };
  if (s.etd) return { date: shiftIsoDays(s.etd, -DEFAULT_CUTOFF_DAYS_BEFORE_ETD), derived: true };
  return { date: null, derived: false };
}

export type AvailabilityKind = "available" | "tight" | "unavailable";

export interface Availability {
  kind: AvailabilityKind;
  /** Whole days from today to the booking deadline (negative = passed). */
  daysToDeadline: number | null;
}

/** Whole-day difference from local today to a YYYY-MM-DD date string. */
export function daysFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function sailingAvailability(s: {
  status: string;
  etd: string | null;
  cargoCutoff: string | null;
  /** Team override — keeps an 'open' sailing bookable past its deadline. */
  keepOpen?: boolean;
}): Availability {
  const deadline = effectiveCargoCutoff(s).date;
  const days = daysFromToday(deadline);
  if (s.status !== "open") return { kind: "unavailable", daysToDeadline: days };
  if (s.keepOpen) return { kind: "available", daysToDeadline: days };
  if (days === null) return { kind: "available", daysToDeadline: null };
  if (days < 0) return { kind: "unavailable", daysToDeadline: days };
  if (days <= TIGHT_WINDOW_DAYS) return { kind: "tight", daysToDeadline: days };
  return { kind: "available", daysToDeadline: days };
}
