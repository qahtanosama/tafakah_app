"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: { userId?: string; email?: string; password?: string };
}

async function requireTeamUser(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "Not signed in" };
  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role !== "team" || !profile.is_active) {
    return { error: "Team access required" };
  }
  return { userId: user.id };
}

export interface UserRow {
  user_id: string;
  email: string | null;
  role: "team" | "client";
  full_name: string | null;
  is_active: boolean;
  buyer_id: string | null;
  buyer_name: string | null;
  created_at: string;
}

export async function listUsers(): Promise<{ ok: boolean; users?: UserRow[]; error?: string }> {
  const guard = await requireTeamUser();
  if ("error" in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const [{ data: profiles, error: pErr }, { data: authList, error: aErr }, { data: buyers }] = await Promise.all([
    admin.from("users_profile").select("user_id, role, full_name, is_active, buyer_id, created_at"),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("buyers").select("id, company_name"),
  ]);
  if (pErr) return { ok: false, error: pErr.message };
  if (aErr) return { ok: false, error: aErr.message };

  const emailByUser = new Map<string, string>();
  for (const u of authList.users ?? []) {
    if (u.id && u.email) emailByUser.set(u.id, u.email);
  }
  const buyerNameById = new Map<string, string>();
  for (const b of buyers ?? []) {
    buyerNameById.set(b.id as string, (b.company_name as string) ?? "");
  }

  const rows: UserRow[] = (profiles ?? []).map((p) => ({
    user_id: p.user_id,
    email: emailByUser.get(p.user_id) ?? null,
    role: p.role as "team" | "client",
    full_name: p.full_name ?? null,
    is_active: p.is_active,
    buyer_id: p.buyer_id ?? null,
    buyer_name: p.buyer_id ? buyerNameById.get(p.buyer_id) ?? null : null,
    created_at: p.created_at,
  }));

  return { ok: true, users: rows };
}

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
  // Fallback (shouldn't happen on the server)
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function createTeamUser(formData: FormData): Promise<ActionResult> {
  const guard = await requireTeamUser();
  if ("error" in guard) return { ok: false, error: guard.error };

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

  revalidatePath("/admin/users");
  return { ok: true, data: { userId: created.user.id, email, password } };
}

export async function createClientUserForBuyer(buyerId: string, passwordIn?: string): Promise<ActionResult> {
  const guard = await requireTeamUser();
  if ("error" in guard) return { ok: false, error: guard.error };

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

  revalidatePath("/admin/users");
  return { ok: true, data: { userId: created.user.id, email: buyer.email as string, password } };
}

export async function toggleUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const guard = await requireTeamUser();
  if ("error" in guard) return { ok: false, error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin.from("users_profile").update({ is_active: active }).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}
