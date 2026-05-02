"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamUser } from "@/lib/auth/require-team";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { logAuditEvent } from "@/lib/audit/log";

export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: { userId?: string; email?: string; password?: string };
}

export type Role = "super_admin" | "team" | "client";

export interface UserRow {
  user_id: string;
  email: string | null;
  role: Role;
  full_name: string | null;
  is_active: boolean;
  buyer_id: string | null;
  buyer_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

/* ─────────────────────────── Read ─────────────────────────── */

export async function listUsers(): Promise<{ ok: boolean; users?: UserRow[]; error?: string; currentUserId?: string }> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const [{ data: profiles, error: pErr }, { data: authList, error: aErr }, { data: buyers }] = await Promise.all([
    admin.from("users_profile").select("user_id, role, full_name, is_active, buyer_id, created_at"),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("buyers").select("id, company_name"),
  ]);
  if (pErr) return { ok: false, error: pErr.message };
  if (aErr) return { ok: false, error: aErr.message };

  const authByUser = new Map<string, { email: string | null; lastSignIn: string | null }>();
  for (const u of authList.users ?? []) {
    if (u.id) authByUser.set(u.id, { email: u.email ?? null, lastSignIn: u.last_sign_in_at ?? null });
  }
  const buyerNameById = new Map<string, string>();
  for (const b of buyers ?? []) {
    buyerNameById.set(b.id as string, (b.company_name as string) ?? "");
  }

  const rows: UserRow[] = (profiles ?? []).map((p) => {
    const a = authByUser.get(p.user_id) ?? { email: null, lastSignIn: null };
    return {
      user_id: p.user_id,
      email: a.email,
      role: p.role as Role,
      full_name: p.full_name ?? null,
      is_active: p.is_active,
      buyer_id: p.buyer_id ?? null,
      buyer_name: p.buyer_id ? buyerNameById.get(p.buyer_id) ?? null : null,
      created_at: p.created_at,
      last_sign_in_at: a.lastSignIn,
    };
  });

  return { ok: true, users: rows, currentUserId: guard.userId };
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function generatePassword(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const cryptoObj =
    (typeof globalThis !== "undefined" && (globalThis.crypto as Crypto | undefined)) || undefined;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(length);
    cryptoObj.getRandomValues(arr);
    let out = "";
    for (let i = 0; i < length; i++) out += alphabet[arr[i] % alphabet.length];
    return out;
  }
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function lookupAuthEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

/* ─────────────────────── Account creation ─────────────────────── */

export async function createTeamUser(formData: FormData): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const fullName = (formData.get("fullName") as string | null)?.trim() ?? "";
  const passwordIn = (formData.get("password") as string | null) ?? "";
  const password = passwordIn && passwordIn.length >= 12 ? passwordIn : generatePassword();

  if (!email || !fullName) return { ok: false, error: "Email and name are required." };

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) return { ok: false, error: createErr?.message ?? "Failed to create user." };

  const { error: profileErr } = await admin.from("users_profile").insert({
    user_id: created.user.id,
    role: "team",
    full_name: fullName,
    is_active: true,
  });
  if (profileErr) {
    try { await admin.auth.admin.deleteUser(created.user.id); } catch { /* ignore */ }
    return { ok: false, error: `Profile insert failed: ${profileErr.message}` };
  }

  await logAuditEvent({
    actorUserId: guard.userId,
    actorEmail: guard.email,
    actorRole: "super_admin",
    action: "account_create",
    targetUserId: created.user.id,
    targetEmail: email,
    metadata: { role: "team", full_name: fullName },
  });

  revalidatePath("/admin/users");
  return { ok: true, data: { userId: created.user.id, email, password } };
}

export async function createClientUserForBuyer(buyerId: string, passwordIn?: string): Promise<ActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: buyer, error: buyerErr } = await admin
    .from("buyers")
    .select("id, company_name, email, portal_enabled")
    .eq("id", buyerId)
    .single();
  if (buyerErr || !buyer) return { ok: false, error: "Buyer not found." };
  if (!buyer.email) return { ok: false, error: "Buyer has no email. Add one before creating a client login." };

  const password = passwordIn && passwordIn.length >= 12 ? passwordIn : generatePassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: buyer.email as string,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) return { ok: false, error: createErr?.message ?? "Failed to create user." };

  const { error: profileErr } = await admin.from("users_profile").insert({
    user_id: created.user.id,
    role: "client",
    full_name: buyer.company_name as string,
    buyer_id: buyer.id as string,
    is_active: true,
  });
  if (profileErr) {
    try { await admin.auth.admin.deleteUser(created.user.id); } catch { /* ignore */ }
    return { ok: false, error: `Profile insert failed: ${profileErr.message}` };
  }

  await admin.from("buyers").update({ portal_enabled: true }).eq("id", buyer.id as string);

  await logAuditEvent({
    actorUserId: guard.userId,
    actorEmail: guard.email,
    actorRole: guard.role,
    action: "client_login_create",
    targetUserId: created.user.id,
    targetEmail: buyer.email as string,
    targetResourceType: "buyer",
    targetResourceId: buyer.id as string,
    metadata: { company_name: buyer.company_name },
  });

  revalidatePath("/admin/users");
  return { ok: true, data: { userId: created.user.id, email: buyer.email as string, password } };
}

/* ───────────────────── Account state changes ───────────────────── */

export async function toggleUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (userId === guard.userId) return { ok: false, error: "You cannot disable your own super-admin account." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("users_profile")
    .select("role, full_name")
    .eq("user_id", userId)
    .single();
  if (!existing) return { ok: false, error: "User not found." };
  if (existing.role === "super_admin") {
    return { ok: false, error: "Cannot disable a super-admin account from the UI. Use SQL." };
  }

  const { error } = await admin.from("users_profile").update({ is_active: active }).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  const targetEmail = await lookupAuthEmail(userId);
  await logAuditEvent({
    actorUserId: guard.userId,
    actorEmail: guard.email,
    actorRole: "super_admin",
    action: active ? "account_enable" : "account_disable",
    targetUserId: userId,
    targetEmail,
    metadata: { previous_role: existing.role, full_name: existing.full_name },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function changeUserRole(userId: string, newRole: "team" | "client"): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (userId === guard.userId) return { ok: false, error: "You cannot change your own role." };
  if (newRole !== "team" && newRole !== "client") {
    return { ok: false, error: "Role must be 'team' or 'client'. Promotion to 'super_admin' must be done via SQL." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("users_profile")
    .select("role, buyer_id, full_name")
    .eq("user_id", userId)
    .single();
  if (!existing) return { ok: false, error: "User not found." };
  if (existing.role === "super_admin") {
    return { ok: false, error: "Cannot demote a super-admin from the UI. Use SQL." };
  }
  if (existing.role === newRole) {
    return { ok: false, error: `User is already ${newRole}.` };
  }

  // Demoting team → client without a buyer link is almost certainly a bug.
  if (newRole === "client" && !existing.buyer_id) {
    return { ok: false, error: "Cannot move to 'client' without a linked buyer. Use the buyer-side 'Create Client Login' flow instead." };
  }

  const { error } = await admin.from("users_profile").update({ role: newRole }).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  const targetEmail = await lookupAuthEmail(userId);
  await logAuditEvent({
    actorUserId: guard.userId,
    actorEmail: guard.email,
    actorRole: "super_admin",
    action: "role_change",
    targetUserId: userId,
    targetEmail,
    metadata: { from: existing.role, to: newRole, full_name: existing.full_name },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resetTeamUserPassword(userId: string): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("users_profile")
    .select("role, full_name")
    .eq("user_id", userId)
    .single();
  if (!existing) return { ok: false, error: "User not found." };
  if (existing.role === "super_admin" && userId !== guard.userId) {
    return { ok: false, error: "Cannot reset password for another super-admin from the UI. Use SQL." };
  }

  const newPassword = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { ok: false, error: error.message };

  const targetEmail = await lookupAuthEmail(userId);
  await logAuditEvent({
    actorUserId: guard.userId,
    actorEmail: guard.email,
    actorRole: "super_admin",
    action: "password_reset",
    targetUserId: userId,
    targetEmail,
    metadata: { role: existing.role },
  });

  return { ok: true, data: { userId, email: targetEmail ?? "", password: newPassword } };
}

/* ─── Buyer portal-access helpers (called from the buyer edit form) ─── */

export interface BuyerPortalStatus {
  buyerExists: boolean;
  buyerId: string | null;
  email: string | null;
  portalEnabled: boolean;
  clientUserId: string | null;
  clientActive: boolean;
}

export async function getBuyerPortalStatus(buyerUuid: string): Promise<{ ok: boolean; error?: string; status?: BuyerPortalStatus }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();

  const { data: buyer, error } = await admin
    .from("buyers")
    .select("id, email, portal_enabled")
    .eq("id", buyerUuid)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!buyer) {
    return { ok: true, status: { buyerExists: false, buyerId: null, email: null, portalEnabled: false, clientUserId: null, clientActive: false } };
  }

  const { data: profile } = await admin
    .from("users_profile")
    .select("user_id, is_active")
    .eq("buyer_id", buyerUuid)
    .eq("role", "client")
    .maybeSingle();

  return {
    ok: true,
    status: {
      buyerExists: true,
      buyerId: (buyer.id as string),
      email: (buyer.email as string | null) ?? null,
      portalEnabled: !!buyer.portal_enabled,
      clientUserId: profile ? (profile.user_id as string) : null,
      clientActive: profile ? !!profile.is_active : false,
    },
  };
}

export async function disableClientUserForBuyer(buyerUuid: string): Promise<ActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("users_profile")
    .select("user_id")
    .eq("buyer_id", buyerUuid)
    .eq("role", "client")
    .maybeSingle();

  if (profile) {
    await admin.from("users_profile").update({ is_active: false }).eq("user_id", profile.user_id as string);
    const targetEmail = await lookupAuthEmail(profile.user_id as string);
    await logAuditEvent({
      actorUserId: guard.userId,
      actorEmail: guard.email,
      actorRole: guard.role,
      action: "account_disable",
      targetUserId: profile.user_id as string,
      targetEmail,
      targetResourceType: "buyer",
      targetResourceId: buyerUuid,
    });
  }
  await admin.from("buyers").update({ portal_enabled: false }).eq("id", buyerUuid);
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resetClientPasswordForBuyer(buyerUuid: string): Promise<ActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();

  const { data: buyer } = await admin.from("buyers").select("email").eq("id", buyerUuid).maybeSingle();
  if (!buyer?.email) return { ok: false, error: "Buyer has no email." };

  const { data: profile } = await admin
    .from("users_profile")
    .select("user_id")
    .eq("buyer_id", buyerUuid)
    .eq("role", "client")
    .maybeSingle();
  if (!profile) return { ok: false, error: "No client login exists for this buyer." };

  const newPassword = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(profile.user_id as string, { password: newPassword });
  if (error) return { ok: false, error: error.message };
  await admin.from("users_profile").update({ is_active: true }).eq("user_id", profile.user_id as string);
  await admin.from("buyers").update({ portal_enabled: true }).eq("id", buyerUuid);

  await logAuditEvent({
    actorUserId: guard.userId,
    actorEmail: guard.email,
    actorRole: guard.role,
    action: "password_reset",
    targetUserId: profile.user_id as string,
    targetEmail: buyer.email as string,
    targetResourceType: "buyer",
    targetResourceId: buyerUuid,
  });

  return { ok: true, data: { userId: profile.user_id as string, email: buyer.email as string, password: newPassword } };
}
