/**
 * Who counts as what, as plain data.
 *
 * The two guards in require-team.ts are "use server", so every export there
 * must be an async action and the policy itself cannot be unit-tested. It
 * lives here instead: one list per capability, no Supabase, no Next.
 *
 * Both lists are ALLOWLISTS. A role added to the app later is refused by both
 * until someone consciously names it — the same default-deny stance the RLS
 * policies take.
 */

/** Full team capability. An assistant is deliberately NOT here. */
const TEAM_ROLES = ["team", "super_admin"] as const;

/** May file documents and keep shipment tracking current. */
const DOC_STAFF_ROLES = ["team", "super_admin", "assistant"] as const;

export function isTeamRole(role: string | null): boolean {
  return role !== null && (TEAM_ROLES as readonly string[]).includes(role);
}

export function isDocStaffRole(role: string | null): boolean {
  return role !== null && (DOC_STAFF_ROLES as readonly string[]).includes(role);
}
