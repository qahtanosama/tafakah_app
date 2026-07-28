/**
 * USD and quantity formatting for team-facing screens.
 *
 * `"$" + n.toLocaleString("en-US", ...)` had been hand-copied into half a dozen
 * components; this is the one place to change it. Buyer-facing (portal) money
 * goes through lib/i18n/format.ts instead, which is locale-aware.
 */

/** $1,234.56 — for anything the user might reconcile against an invoice. */
export function usd(n: number): string {
  return "$" + safe(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** $1,235 — for headline figures and per-MT prices, which we quote whole. */
export function usd0(n: number): string {
  return "$" + safe(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** 19,400 / 194.00 — thousands-separated quantities. */
export function qty(n: number, decimals = 0): string {
  return safe(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** NaN and Infinity render as "$NaN" otherwise, which looks like a crash. */
function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}
