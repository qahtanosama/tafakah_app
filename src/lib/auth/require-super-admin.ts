"use server";

import { createClient } from "@/lib/supabase/server";

export type SuperGuardOk = { ok: true; userId: string; email: string | null };
export type SuperGuardErr = { ok: false; error: string };

/**
 * Strict super-admin-only guard. Use for: user role changes, audit log read,
 * impersonation, and any system-wide management action. Team users are
 * REJECTED here — for shared utility actions use `requireTeamUser` instead.
 */
export async function requireSuperAdmin(): Promise<SuperGuardOk | SuperGuardErr> {
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
  if (profile.role !== "super_admin") return { ok: false, error: "Super admin access required" };

  return { ok: true, userId: user.id, email: user.email ?? null };
}
