"use server";

import { createClient } from "@/lib/supabase/server";

export async function setPreferredLanguage(
  language: "en" | "ar"
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (language !== "en" && language !== "ar") {
    return { ok: false, error: "Invalid language" };
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("users_profile")
    .update({ preferred_language: language })
    .eq("user_id", userData.user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 8) return { ok: false, error: "Password too short" };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || !user.email) return { ok: false, error: "Not signed in" };

  // Verify current password by re-authenticating.
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInErr) return { ok: false, error: "Current password is incorrect" };

  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true };
}
