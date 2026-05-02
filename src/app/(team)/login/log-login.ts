"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

/**
 * Records a login event in the audit log. Called from the client-side login
 * form right after a successful auth.signInWithPassword. We deliberately do
 * NOT block on this — auth has already succeeded and a logging glitch must
 * not bounce the user out.
 */
export async function recordLoginEvent(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const admin = createAdminClient();
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const { data: profile } = await admin
      .from("users_profile")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    await logAuditEvent({
      actorUserId: userId,
      actorEmail: authUser?.user?.email ?? null,
      actorRole: (profile?.role as string | undefined) ?? null,
      action: "login",
    });
  } catch (err) {
    console.error("[audit] recordLoginEvent failed:", err);
  }
}

export async function recordLogoutEvent(userId: string | null, email: string | null, role: string | null): Promise<void> {
  if (!userId) return;
  try {
    await logAuditEvent({
      actorUserId: userId,
      actorEmail: email,
      actorRole: role,
      action: "logout",
    });
  } catch (err) {
    console.error("[audit] recordLogoutEvent failed:", err);
  }
}
