"use server";

import { createClient } from "@/lib/supabase/server";

export type GuardOk = { ok: true; userId: string; role: "team" | "super_admin"; email: string | null };
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
