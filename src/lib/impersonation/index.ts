"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { logAuditEvent } from "@/lib/audit/log";

const COOKIE_NAME = "sb-impersonation-target";
const MAX_DURATION_MS = 60 * 60 * 1000; // 1 hour cap

export interface ImpersonationContext {
  sessionId: string;
  superAdminUserId: string;
  superAdminEmail: string | null;
  targetUserId: string;
  targetEmail: string | null;
  targetBuyerId: string | null;
  targetFullName: string | null;
  startedAt: string;
}

/**
 * Reads the impersonation cookie, validates the session against the DB, and
 * returns the active context if everything is fresh and consistent. Returns
 * null in every other case (no cookie, expired, ended, mismatch, etc.) so
 * callers can simply check truthiness.
 *
 * NEVER trusts the cookie alone — every read re-checks the DB row, the
 * actual logged-in super_admin, the 1-hour cap, and the target's profile.
 */
export async function getActiveImpersonation(): Promise<ImpersonationContext | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const supabase = await createServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const realUser = userData.user;
  if (!realUser) return null;

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("impersonation_sessions")
    .select("id, super_admin_user_id, target_user_id, started_at, ended_at, active")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;
  if (!session.active || session.ended_at) return null;
  if (session.super_admin_user_id !== realUser.id) return null;

  // 1-hour cap: any session older than that is treated as expired and
  // cleaned up so the cookie doesn't keep working.
  const startedAt = new Date(session.started_at as string).getTime();
  if (Date.now() - startedAt > MAX_DURATION_MS) {
    await admin
      .from("impersonation_sessions")
      .update({ active: false, ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    return null;
  }

  // Verify super_admin role hasn't been revoked since the session started.
  const { data: actorProfile } = await admin
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", realUser.id)
    .maybeSingle();
  if (!actorProfile || actorProfile.role !== "super_admin" || !actorProfile.is_active) {
    return null;
  }

  // Resolve target.
  const { data: targetProfile } = await admin
    .from("users_profile")
    .select("user_id, role, is_active, buyer_id, full_name")
    .eq("user_id", session.target_user_id)
    .maybeSingle();
  if (!targetProfile || !targetProfile.is_active) return null;

  // Look up target's auth email lazily.
  const { data: targetAuth } = await admin.auth.admin.getUserById(session.target_user_id as string);

  return {
    sessionId: session.id as string,
    superAdminUserId: realUser.id,
    superAdminEmail: realUser.email ?? null,
    targetUserId: session.target_user_id as string,
    targetEmail: targetAuth?.user?.email ?? null,
    targetBuyerId: (targetProfile.buyer_id as string | null) ?? null,
    targetFullName: (targetProfile.full_name as string | null) ?? null,
    startedAt: session.started_at as string,
  };
}

export async function startImpersonation(
  targetUserId: string,
): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!targetUserId) return { ok: false, error: "Missing target." };
  if (targetUserId === guard.userId) return { ok: false, error: "Cannot impersonate yourself." };

  const admin = createAdminClient();

  const { data: targetProfile } = await admin
    .from("users_profile")
    .select("user_id, role, is_active, buyer_id, full_name, preferred_language")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!targetProfile) return { ok: false, error: "Target profile not found." };
  if (!targetProfile.is_active) return { ok: false, error: "Target account is disabled." };
  if (targetProfile.role !== "client") {
    return { ok: false, error: "Impersonation is currently limited to client accounts." };
  }
  if (!targetProfile.buyer_id) {
    return { ok: false, error: "Target client has no linked buyer." };
  }

  // End any prior active session for this super_admin (one-active-per-admin
  // unique index would otherwise reject the insert).
  await admin
    .from("impersonation_sessions")
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq("super_admin_user_id", guard.userId)
    .eq("active", true);

  const { data: inserted, error: insErr } = await admin
    .from("impersonation_sessions")
    .insert({
      super_admin_user_id: guard.userId,
      target_user_id: targetUserId,
      active: true,
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { ok: false, error: insErr?.message ?? "Failed to start session." };

  const { data: targetAuth } = await admin.auth.admin.getUserById(targetUserId);
  const targetEmail = targetAuth?.user?.email ?? null;

  const cookieStore = await cookies();
  cookieStore.set({
    name: COOKIE_NAME,
    value: inserted.id as string,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(MAX_DURATION_MS / 1000),
  });

  await logAuditEvent({
    actorUserId: guard.userId,
    actorEmail: guard.email,
    actorRole: "super_admin",
    action: "impersonation_start",
    targetUserId,
    targetEmail,
    metadata: { session_id: inserted.id, role: "client", buyer_id: targetProfile.buyer_id },
  });

  const redirectTo =
    targetProfile.preferred_language === "ar" ? "/ar/portal" : "/portal";
  return { ok: true, redirectTo };
}

export async function endImpersonation(): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;

  // Always clear the cookie no matter what we find in DB.
  cookieStore.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  if (!sessionId) return { ok: true, redirectTo: "/admin/super" };

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("impersonation_sessions")
    .select("super_admin_user_id, target_user_id, active")
    .eq("id", sessionId)
    .maybeSingle();

  if (session && session.active) {
    await admin
      .from("impersonation_sessions")
      .update({ active: false, ended_at: new Date().toISOString() })
      .eq("id", sessionId);

    const supabase = await createServerClient();
    const { data: userData } = await supabase.auth.getUser();
    const targetAuth = await admin.auth.admin.getUserById(session.target_user_id as string);

    await logAuditEvent({
      actorUserId: userData.user?.id ?? (session.super_admin_user_id as string),
      actorEmail: userData.user?.email ?? null,
      actorRole: "super_admin",
      action: "impersonation_end",
      targetUserId: session.target_user_id as string,
      targetEmail: targetAuth.data?.user?.email ?? null,
      metadata: { session_id: sessionId },
    });
  }

  return { ok: true, redirectTo: "/admin/super" };
}
