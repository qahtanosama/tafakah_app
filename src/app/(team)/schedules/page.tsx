import type { Metadata } from "next";
import AppHeader from "@/components/ui/app-header";
import { createClient } from "@/lib/supabase/server";
import SchedulesManager from "@/components/schedules/SchedulesManager";
import {
  rowToSailing,
  rowToInternal,
  rowToLoadingPlan,
  type SailingScheduleRow,
  type SailingInternalRow,
  type LoadingPlanRow,
  type LoadingPlanWithContext,
  type SailingScheduleWithInternal,
} from "@/types/schedule";

export const metadata: Metadata = {
  title: "Sailing Schedules — TAFAKAH Food",
  description: "Publish vessel departure schedules and review client loading plans",
};

type PlanJoinRow = LoadingPlanRow & {
  buyers: { company_name: string | null } | null;
  sailing_schedules: {
    shipping_line: string;
    vessel: string;
    voyage: string | null;
    etd: string | null;
    status: SailingScheduleRow["status"];
  } | null;
};

export default async function SchedulesPage() {
  const supabase = await createClient();

  // The internal join (freight rates etc.) has team-only RLS: for anyone
  // else the relation simply comes back null.
  const [{ data: sailingRows }, { data: planRows }] = await Promise.all([
    supabase
      .from("sailing_schedules")
      .select("*, sailing_schedule_internal(ocean_freight, booking_plan, space_release_status, remark)")
      .order("etd", { ascending: true }),
    supabase
      .from("loading_plans")
      .select(
        "*, buyers(company_name), sailing_schedules(shipping_line, vessel, voyage, etd, status)",
      )
      .order("created_at", { ascending: false }),
  ]);

  type SailingJoinRow = SailingScheduleRow & {
    sailing_schedule_internal: SailingInternalRow | null;
  };
  const sailings: SailingScheduleWithInternal[] = (
    (sailingRows ?? []) as SailingJoinRow[]
  ).map((row) => ({
    ...rowToSailing(row),
    internal: rowToInternal(row.sailing_schedule_internal),
  }));
  const plans: LoadingPlanWithContext[] = ((planRows ?? []) as PlanJoinRow[]).map((row) => ({
    ...rowToLoadingPlan(row),
    buyerName: row.buyers?.company_name ?? null,
    sailing: row.sailing_schedules
      ? {
          shippingLine: row.sailing_schedules.shipping_line,
          vessel: row.sailing_schedules.vessel,
          voyage: row.sailing_schedules.voyage,
          etd: row.sailing_schedules.etd,
          status: row.sailing_schedules.status,
        }
      : null,
  }));

  return (
    <div className="flex flex-col min-h-screen relative font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/50 via-white to-slate-50 dark:from-indigo-950/20 dark:via-zinc-950 dark:to-zinc-950"></div>
      <AppHeader title="Sailing Schedules" />
      <SchedulesManager sailings={sailings} plans={plans} />
    </div>
  );
}
