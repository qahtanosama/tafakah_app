/**
 * Where an assistant may go.
 *
 * An ALLOWLIST, not a blocklist. Anything added to the app later is denied to
 * her until someone consciously adds it here — the same default-deny stance as
 * her RLS policies. A blocklist would silently admit every new screen.
 *
 * This is only the visible surface. The database is what protects the numbers:
 * an assistant has no policy on contract_finance or product_cost_sheets, so
 * reaching a page by hand still returns nothing.
 *
 * Pure module with no Next imports, so the rule can be tested directly.
 */

export const ASSISTANT_PATHS = [
  "/", // home, showing a reduced set of tiles
  "/shipping", // ETD / ETA / vessel / containers — her main job
  "/documents", // download and upload
  "/contract-log", // read-only, so she can find the contract she needs
  "/logout",
] as const;

/** True when an assistant may load this path. Exact match or a sub-path. */
export function isAssistantPath(pathname: string): boolean {
  return ASSISTANT_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/"))
  );
}
