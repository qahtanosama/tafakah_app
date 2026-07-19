"use server";

/**
 * Sailing-schedule server actions (team side).
 *
 * The schedule is imported from the weekly carrier Excel sheet — parsing
 * happens client-side (see components/schedules/ScheduleImport.tsx); this
 * module receives already-normalized SailingInput rows. Import is an upsert:
 * a row matching an existing sailing on (vessel, voyage) case-insensitively
 * updates that sailing in place, so re-uploading a corrected weekly sheet
 * never duplicates.
 *
 * Client-side loading-plan actions live in src/lib/portal/loading-plans.ts.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamUser } from "@/lib/auth/require-team";
import { routing } from "@/i18n/routing";
import {
  SAILING_STATUSES,
  TEAM_SETTABLE_PLAN_STATUSES,
  type SailingInput,
  type SailingStatus,
} from "@/types/schedule";

function revalidateSchedulePages(): void {
  revalidatePath("/schedules");
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/portal/schedule`);
  }
}

const sailingKey = (vessel: string, voyage: string | null): string =>
  `${vessel.trim().toLowerCase()}|${(voyage ?? "").trim().toLowerCase()}`;

export type ImportSailingsResult =
  | { ok: true; inserted: number; updated: number; skipped: number }
  | { ok: false; error: string };

export async function importSailings(rows: SailingInput[]): Promise<ImportSailingsResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };

  const valid = rows.filter((r) => r.shippingLine.trim() && r.vessel.trim());
  const skipped = rows.length - valid.length;
  if (!valid.length) return { ok: false, error: "No rows with both shipping line and vessel to import" };

  const supabase = createAdminClient();

  // Match against non-departed sailings only: a vessel's next rotation under
  // the same name/voyage pattern must not overwrite historic entries.
  const { data: existing, error: readErr } = await supabase
    .from("sailing_schedules")
    .select("id, vessel, voyage")
    .in("status", ["open", "closed"]);
  if (readErr) return { ok: false, error: readErr.message };

  const existingByKey = new Map<string, string>();
  for (const row of existing ?? []) {
    existingByKey.set(sailingKey(row.vessel as string, row.voyage as string | null), row.id as string);
  }

  let inserted = 0;
  let updated = 0;
  for (const row of valid) {
    // notes is deliberately absent: it is team-authored and client-visible,
    // and a sheet re-upload must never erase or replace it.
    const payload = {
      shipping_line: row.shippingLine.trim(),
      vessel: row.vessel.trim(),
      voyage: row.voyage?.trim() || null,
      port_of_loading: row.portOfLoading?.trim() || null,
      destination: row.destination?.trim() || null,
      etd: row.etd || null,
      eta: row.eta || null,
      cargo_cutoff: row.cargoCutoff || null,
      doc_cutoff: row.docCutoff || null,
      transit_days: Number.isInteger(row.transitDays) && (row.transitDays as number) >= 0 ? row.transitDays : null,
      commodity: row.commodity?.trim() || null,
    };

    let scheduleId: string;
    const existingId = existingByKey.get(sailingKey(payload.vessel, payload.voyage));
    if (existingId) {
      const { error } = await supabase
        .from("sailing_schedules")
        .update(payload)
        .eq("id", existingId);
      if (error) return { ok: false, error: error.message };
      scheduleId = existingId;
      updated += 1;
    } else {
      const { data, error } = await supabase
        .from("sailing_schedules")
        .insert({ ...payload, created_by: guard.userId })
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };
      scheduleId = data.id as string;
      existingByKey.set(sailingKey(payload.vessel, payload.voyage), scheduleId);
      inserted += 1;
    }

    // Team-only sheet fields (freight rates etc.). The sheet is the source of
    // truth for these, so re-uploads overwrite, including back to null.
    const { error: internalErr } = await supabase.from("sailing_schedule_internal").upsert(
      {
        schedule_id: scheduleId,
        ocean_freight: row.oceanFreight?.trim() || null,
        booking_plan: row.bookingPlan?.trim() || null,
        space_release_status: row.spaceRelease?.trim() || null,
        remark: row.remark?.trim() || null,
      },
      { onConflict: "schedule_id" },
    );
    if (internalErr) return { ok: false, error: internalErr.message };
  }

  revalidateSchedulePages();
  return { ok: true, inserted, updated, skipped };
}

export type ScheduleActionResult = { ok: true } | { ok: false; error: string };

export async function updateSailing(
  id: string,
  input: SailingInput & { status?: SailingStatus },
): Promise<ScheduleActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!input.shippingLine.trim() || !input.vessel.trim()) {
    return { ok: false, error: "Shipping line and vessel are required" };
  }
  if (input.status && !SAILING_STATUSES.includes(input.status)) {
    return { ok: false, error: "Invalid status" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sailing_schedules")
    .update({
      shipping_line: input.shippingLine.trim(),
      vessel: input.vessel.trim(),
      voyage: input.voyage?.trim() || null,
      port_of_loading: input.portOfLoading?.trim() || null,
      destination: input.destination?.trim() || null,
      etd: input.etd || null,
      eta: input.eta || null,
      cargo_cutoff: input.cargoCutoff || null,
      doc_cutoff: input.docCutoff || null,
      transit_days: Number.isInteger(input.transitDays) && (input.transitDays as number) >= 0 ? input.transitDays : null,
      commodity: input.commodity?.trim() || null,
      notes: input.notes?.trim() || null,
      ...(input.status ? { status: input.status } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const { error: internalErr } = await supabase.from("sailing_schedule_internal").upsert(
    {
      schedule_id: id,
      ocean_freight: input.oceanFreight?.trim() || null,
      booking_plan: input.bookingPlan?.trim() || null,
      space_release_status: input.spaceRelease?.trim() || null,
      remark: input.remark?.trim() || null,
    },
    { onConflict: "schedule_id" },
  );
  if (internalErr) return { ok: false, error: internalErr.message };

  revalidateSchedulePages();
  return { ok: true };
}

export async function setSailingStatus(
  id: string,
  status: SailingStatus,
): Promise<ScheduleActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!SAILING_STATUSES.includes(status)) return { ok: false, error: "Invalid status" };

  const supabase = createAdminClient();
  const { error } = await supabase.from("sailing_schedules").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateSchedulePages();
  return { ok: true };
}

/** Deleting a sailing cascades to its loading plans — reserve for mistakes. */
export async function deleteSailing(id: string): Promise<ScheduleActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };

  const supabase = createAdminClient();
  const { error } = await supabase.from("sailing_schedules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateSchedulePages();
  return { ok: true };
}

/** Bulk delete (cleanup of departed/past sailings). Cascades to loading plans. */
export async function deleteSailings(ids: string[]): Promise<ScheduleActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!ids.length) return { ok: true };

  const supabase = createAdminClient();
  const { error } = await supabase.from("sailing_schedules").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };

  revalidateSchedulePages();
  return { ok: true };
}

/** Bulk status change (e.g. mark a whole week's sailings departed). */
export async function setSailingsStatus(
  ids: string[],
  status: SailingStatus,
): Promise<ScheduleActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!SAILING_STATUSES.includes(status)) return { ok: false, error: "Invalid status" };
  if (!ids.length) return { ok: true };

  const supabase = createAdminClient();
  const { error } = await supabase.from("sailing_schedules").update({ status }).in("id", ids);
  if (error) return { ok: false, error: error.message };

  revalidateSchedulePages();
  return { ok: true };
}

/**
 * Team override: keep an 'open' sailing bookable past its cut-off/ETD.
 * Requires migration 20260719_150000 (keep_open column).
 */
export async function setSailingKeepOpen(
  id: string,
  keepOpen: boolean,
): Promise<ScheduleActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sailing_schedules")
    .update({ keep_open: keepOpen })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateSchedulePages();
  return { ok: true };
}

export async function setLoadingPlanStatus(
  id: string,
  status: (typeof TEAM_SETTABLE_PLAN_STATUSES)[number],
): Promise<ScheduleActionResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!TEAM_SETTABLE_PLAN_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid status" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("loading_plans").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateSchedulePages();
  return { ok: true };
}
