"use server";

import { createClient } from "@/lib/supabase/server";

export type StaffRole = "team" | "super_admin" | "assistant";
export type GuardOk = { ok: true; userId: string; role: StaffRole; email: string | null };
export type GuardErr = { ok: false; error: string };

/**
 * Server-side guard for actions that require **team-level** access.
 * Both `team` and `super_admin` profiles pass — super_admin inherits all
 * team capabilities. Use `requireSuperAdmin` if a route is super-only.
 *
 * Returns the resolved actor info so callers can populate the audit log
 * without a second round-trip.
 */
export async function requireTeamUser(): Promise<GuardOk | GuardErr> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", user.id)
    .single();

  if (!profile || !profile.is_active) return { ok: false, error: "Account disabled" };
  if (profile.role !== "team" && profile.role !== "super_admin") {
    return { ok: false, error: "Team access required" };
  }
  return { ok: true, userId: user.id, role: profile.role as "team" | "super_admin", email: user.email ?? null };
}

/**
 * Guard for the two jobs an assistant actually does: filing documents and
 * keeping shipment tracking current. Passes `team`, `super_admin` AND
 * `assistant`.
 *
 * Deliberately narrow. Use it ONLY on document upload/download and shipping
 * updates — never on anything that touches money. save-finance.ts stays on
 * requireTeamUser, and so does anything added later unless someone makes a
 * conscious decision here.
 *
 * The database enforces this too: an assistant has no policy on
 * contract_finance or product_cost_sheets, so even a mistake in this file
 * cannot expose what we paid or what we were paid. This guard exists so she
 * gets a clean refusal rather than a silent empty result.
 */
export async function requireDocStaff(): Promise<GuardOk | GuardErr> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", user.id)
    .single();

  if (!profile || !profile.is_active) return { ok: false, error: "Account disabled" };
  const role = profile.role as string;
  if (role !== "team" && role !== "super_admin" && role !== "assistant") {
    return { ok: false, error: "Staff access required" };
  }
  return { ok: true, userId: user.id, role: role as StaffRole, email: user.email ?? null };
}
