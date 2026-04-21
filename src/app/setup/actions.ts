"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface SetupResult {
  ok: boolean;
  error?: string;
  userId?: string;
}

/** Returns true if no users exist yet (setup can proceed). */
export async function isSetupNeeded(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
    return (data.users?.length ?? 0) === 0;
  } catch {
    // If the admin client can't reach Supabase yet, assume setup is needed so the user sees a useful error.
    return true;
  }
}

export async function createFirstAdmin(formData: FormData): Promise<SetupResult> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string | null) ?? "";
  const fullName = (formData.get("fullName") as string | null)?.trim() ?? "";

  if (!email || !password || !fullName) return { ok: false, error: "All fields are required." };
  if (password.length < 12) return { ok: false, error: "Password must be at least 12 characters." };
  if (password !== confirmPassword) return { ok: false, error: "Passwords do not match." };

  // Double-check no users exist before creating (race-safe-ish)
  if (!(await isSetupNeeded())) {
    return { ok: false, error: "Setup already completed. Go to /login." };
  }

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return { ok: false, error: createErr?.message ?? "Failed to create user." };
  }

  const { error: profileErr } = await admin.from("users_profile").insert({
    user_id: created.user.id,
    role: "team",
    full_name: fullName,
    is_active: true,
  });
  if (profileErr) {
    // Roll back the auth user so the admin can retry cleanly
    try { await admin.auth.admin.deleteUser(created.user.id); } catch { /* ignore */ }
    return { ok: false, error: `Profile insert failed: ${profileErr.message}` };
  }

  return { ok: true, userId: created.user.id };
}
