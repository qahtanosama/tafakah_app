// Booking availability derived from a sailing's dates. Pure module — used by
// the team table, the portal cards, AND the submitLoadingPlan server action,
// so the portal can never submit a plan the UI would have flagged.
//
// Rules (team-set status wins over everything):
//   * status != open                    → unavailable
//   * keepOpen (team override)          → available even past the deadline
//   * booking deadline (cargo cut-off, else ETD) already passed → unavailable
//   * deadline within TIGHT_WINDOW_DAYS → tight ("booking closes in Xd")
//   * otherwise                         → available

export const TIGHT_WINDOW_DAYS = 7;

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
  const deadline = s.cargoCutoff ?? s.etd;
  const days = daysFromToday(deadline);
  if (s.status !== "open") return { kind: "unavailable", daysToDeadline: days };
  if (s.keepOpen) return { kind: "available", daysToDeadline: days };
  if (days === null) return { kind: "available", daysToDeadline: null };
  if (days < 0) return { kind: "unavailable", daysToDeadline: days };
  if (days <= TIGHT_WINDOW_DAYS) return { kind: "tight", daysToDeadline: days };
  return { kind: "available", daysToDeadline: days };
}
