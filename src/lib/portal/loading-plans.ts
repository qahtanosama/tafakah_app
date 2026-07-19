"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sailingAvailability } from "@/lib/schedule-availability";

export type SubmitLoadingPlanResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Submit a loading plan for an open sailing.
 *
 * Security is enforced at the DATABASE layer (same model as arrival reports):
 * the authenticated cookie-session client is used, so the insert passes
 * through RLS — a client can only insert a plan for their OWN buyer_id and as
 * themselves. The checks below are a friendly first line for clean errors.
 */
export async function submitLoadingPlan(
  formData: FormData,
  locale: string,
): Promise<SubmitLoadingPlanResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "notSignedIn" };

  const scheduleId = String(formData.get("scheduleId") ?? "").trim();
  if (!scheduleId) return { ok: false, error: "missingSchedule" };

  const { data: profile } = await supabase
    .from("users_profile")
    .select("buyer_id, role, is_active")
    .eq("user_id", user.id)
    .single();
  if (!profile?.is_active || profile.role !== "client" || !profile.buyer_id) {
    return { ok: false, error: "accessDenied" };
  }

  // RLS lets any active client read the schedule; reject sailings that are
  // closed by status OR by date (cut-off/ETD passed), honoring the team's
  // keep-open override — same rule the UI shows. select("*") keeps this
  // deploy-order-safe while the keep_open migration hasn't been applied yet.
  const { data: sailing } = await supabase
    .from("sailing_schedules")
    .select("*")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!sailing) return { ok: false, error: "sailingNotFound" };
  const availability = sailingAvailability({
    status: sailing.status as string,
    etd: sailing.etd as string | null,
    cargoCutoff: sailing.cargo_cutoff as string | null,
    keepOpen: (sailing as { keep_open?: boolean | null }).keep_open ?? false,
  });
  if (availability.kind === "unavailable") return { ok: false, error: "sailingClosed" };

  const containersRaw = String(formData.get("containers") ?? "").trim();
  const containers = containersRaw ? Number(containersRaw) : null;
  if (containers !== null && (!Number.isInteger(containers) || containers <= 0)) {
    return { ok: false, error: "invalidNumber" };
  }

  const quantity = String(formData.get("quantity") ?? "").trim() || null;
  const cargoReadyDate = String(formData.get("cargoReadyDate") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!containers && !quantity && !notes) return { ok: false, error: "emptyPlan" };

  const { data, error } = await supabase
    .from("loading_plans")
    .insert({
      schedule_id: scheduleId,
      buyer_id: profile.buyer_id,
      containers,
      quantity,
      cargo_ready_date: cargoReadyDate,
      notes,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    // RLS insert denial (foreign buyer) also surfaces here.
    return { ok: false, error: "saveFailed" };
  }

  revalidatePath(`/${locale}/portal/schedule`);
  return { ok: true, id: data.id as string };
}

export type CancelLoadingPlanResult = { ok: true } | { ok: false; error: string };

/**
 * Cancel the client's own still-pending plan. RLS only allows updating own
 * rows while status = 'submitted', and only to 'submitted'/'cancelled'.
 */
export async function cancelLoadingPlan(
  planId: string,
  locale: string,
): Promise<CancelLoadingPlanResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "notSignedIn" };

  const { data, error } = await supabase
    .from("loading_plans")
    .update({ status: "cancelled" })
    .eq("id", planId)
    .select("id");
  if (error) return { ok: false, error: "saveFailed" };
  if (!data?.length) return { ok: false, error: "accessDenied" };

  revalidatePath(`/${locale}/portal/schedule`);
  return { ok: true };
}
