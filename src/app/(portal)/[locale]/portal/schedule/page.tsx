import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveImpersonation } from "@/lib/impersonation";
import SailingScheduleSection, {
  type ScheduleLabels,
} from "@/components/portal/SailingScheduleSection";
import type { AppLocale } from "@/lib/i18n/format";
import {
  rowToSailing,
  rowToLoadingPlan,
  type SailingScheduleRow,
  type LoadingPlanRow,
} from "@/types/schedule";

export default async function PortalSchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "portal.schedule" });

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  // Same impersonation-aware profile resolution as the portal dashboard.
  const impersonation = await getActiveImpersonation();

  let effectiveBuyerId: string | null = null;
  if (impersonation && impersonation.targetBuyerId) {
    effectiveBuyerId = impersonation.targetBuyerId;
  } else {
    const { data: profile } = await supabase
      .from("users_profile")
      .select("buyer_id, role, is_active")
      .eq("user_id", user.id)
      .single();
    if (!profile?.is_active || profile.role !== "client") redirect("/login?error=disabled");
    effectiveBuyerId = profile.buyer_id;
  }

  // Sailings: RLS lets any active client (or team, when impersonating) read
  // the whole port schedule. Plans are explicitly scoped to the effective
  // buyer — RLS enforces this for clients; the filter matters when a team
  // session (impersonation) would otherwise see every buyer's plans.
  const [{ data: sailingRows }, { data: planRows }] = await Promise.all([
    supabase.from("sailing_schedules").select("*").order("etd", { ascending: true }),
    effectiveBuyerId
      ? supabase
          .from("loading_plans")
          .select("*")
          .eq("buyer_id", effectiveBuyerId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as LoadingPlanRow[] }),
  ]);

  const sailings = ((sailingRows ?? []) as SailingScheduleRow[]).map(rowToSailing);
  const plans = ((planRows ?? []) as LoadingPlanRow[]).map(rowToLoadingPlan);

  const labels: ScheduleLabels = {
    sailingsHeading: t("sailingsHeading"),
    sailingsIntro: t("sailingsIntro"),
    noSailings: t("noSailings"),
    line: t("line"),
    vessel: t("vessel"),
    voyage: t("voyage"),
    pol: t("pol"),
    destination: t("destination"),
    commodity: t("commodity"),
    cargoCutoff: t("cargoCutoff"),
    docCutoff: t("docCutoff"),
    etd: t("etd"),
    eta: t("eta"),
    transitDays: t("transitDays"),
    status: t("status"),
    filterFrom: t("filterFrom"),
    filterTo: t("filterTo"),
    filterAll: t("filterAll"),
    filterClear: t("filterClear"),
    noMatches: t("noMatches"),
    badgeClosesIn: t("badgeClosesIn"),
    badgeClosesToday: t("badgeClosesToday"),
    badgeClosed: t("badgeClosed"),
    estimated: t("estimated"),
    statuses: {
      open: t("statuses.open"),
      closed: t("statuses.closed"),
      departed: t("statuses.departed"),
      cancelled: t("statuses.cancelled"),
    },
    planLoading: t("planLoading"),
    closedForBooking: t("closedForBooking"),
    planFormTitle: t("planFormTitle"),
    containers: t("containers"),
    containersHint: t("containersHint"),
    quantity: t("quantity"),
    quantityPlaceholder: t("quantityPlaceholder"),
    cargoReadyDate: t("cargoReadyDate"),
    notes: t("notes"),
    notesPlaceholder: t("notesPlaceholder"),
    submit: t("submit"),
    submitting: t("submitting"),
    cancel: t("cancel"),
    myPlansHeading: t("myPlansHeading"),
    noPlans: t("noPlans"),
    submittedOn: t("submittedOn"),
    planStatuses: {
      submitted: t("planStatuses.submitted"),
      confirmed: t("planStatuses.confirmed"),
      booked: t("planStatuses.booked"),
      declined: t("planStatuses.declined"),
      cancelled: t("planStatuses.cancelled"),
    },
    cancelPlan: t("cancelPlan"),
    cancelling: t("cancelling"),
    errors: {
      notSignedIn: t("errors.notSignedIn"),
      accessDenied: t("errors.accessDenied"),
      sailingNotFound: t("errors.sailingNotFound"),
      sailingClosed: t("errors.sailingClosed"),
      invalidNumber: t("errors.invalidNumber"),
      emptyPlan: t("errors.emptyPlan"),
      saveFailed: t("errors.saveFailed"),
      missingSchedule: t("errors.saveFailed"),
    },
  };

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-navy">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
      </section>

      <SailingScheduleSection
        sailings={sailings}
        plans={plans}
        locale={locale as AppLocale}
        canSubmit={!impersonation}
        labels={labels}
      />
    </div>
  );
}
