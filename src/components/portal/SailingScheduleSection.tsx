"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Ship, X } from "lucide-react";
import { submitLoadingPlan, cancelLoadingPlan } from "@/lib/portal/loading-plans";
import { sailingAvailability, effectiveCargoCutoff } from "@/lib/schedule-availability";
import type { LoadingPlan, SailingSchedule } from "@/types/schedule";
import { formatDate, type AppLocale } from "@/lib/i18n/format";

export interface ScheduleLabels {
  sailingsHeading: string;
  sailingsIntro: string;
  noSailings: string;
  line: string;
  vessel: string;
  voyage: string;
  pol: string;
  destination: string;
  commodity: string;
  cargoCutoff: string;
  docCutoff: string;
  etd: string;
  eta: string;
  transitDays: string;
  status: string;
  filterFrom: string;
  filterTo: string;
  filterAll: string;
  filterClear: string;
  noMatches: string;
  badgeClosesIn: string; // "Booking closes in {days} days"
  badgeClosesToday: string;
  badgeClosed: string;
  estimated: string; // "(est.)" suffix for the derived ETD−5 cut-off
  statuses: Record<string, string>; // open/closed/departed/cancelled
  planLoading: string;
  closedForBooking: string;
  planFormTitle: string; // "Loading plan for {vessel}"
  containers: string;
  containersHint: string;
  quantity: string;
  quantityPlaceholder: string;
  cargoReadyDate: string;
  notes: string;
  notesPlaceholder: string;
  submit: string;
  submitting: string;
  cancel: string;
  myPlansHeading: string;
  noPlans: string;
  submittedOn: string; // "Submitted {date}"
  planStatuses: Record<string, string>; // submitted/confirmed/booked/declined/cancelled
  cancelPlan: string;
  cancelling: string;
  errors: Record<string, string>;
}

interface Props {
  sailings: SailingSchedule[];
  plans: LoadingPlan[];
  locale: AppLocale;
  /** False when a super admin is impersonating — the form is view-only then. */
  canSubmit: boolean;
  labels: ScheduleLabels;
}

const EMPTY_FORM = { containers: "", quantity: "", cargoReadyDate: "", notes: "" };

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800",
  closed: "bg-amber-100 text-amber-800",
  departed: "bg-slate-200 text-slate-700",
  cancelled: "bg-red-100 text-red-700",
};

const PLAN_STATUS_STYLES: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  booked: "bg-indigo-100 text-indigo-800",
  declined: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-600",
};

export default function SailingScheduleSection({ sailings, plans, locale, canSubmit, labels }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const sailingById = new Map(sailings.map((s) => [s.id, s]));
  // Departed/cancelled sailings stay out of the upcoming list but remain in
  // the map so past loading plans can still name their vessel.
  const upcoming = sailings.filter((s) => s.status === "open" || s.status === "closed");

  const EMPTY_FILTERS = { pol: "", dest: "", commodity: "", from: "", to: "" };
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const hasFilters = Object.values(filters).some(Boolean);

  const distinct = useMemo(() => {
    const pick = (fn: (s: SailingSchedule) => string | null) =>
      Array.from(new Set(upcoming.map(fn).filter((v): v is string => !!v))).sort();
    return {
      pols: pick((s) => s.portOfLoading),
      dests: pick((s) => s.destination),
      commodities: pick((s) => s.commodity),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sailings]);

  const visible = useMemo(
    () =>
      upcoming.filter((s) => {
        if (filters.pol && s.portOfLoading !== filters.pol) return false;
        if (filters.dest && s.destination !== filters.dest) return false;
        if (filters.commodity && s.commodity !== filters.commodity) return false;
        // ETD range: YYYY-MM-DD strings compare lexicographically.
        if (filters.from && (!s.etd || s.etd < filters.from)) return false;
        if (filters.to && (!s.etd || s.etd > filters.to)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sailings, filters],
  );

  const openPlanner = (id: string) => {
    setPlanningId(id);
    setForm({ ...EMPTY_FORM });
    setError(null);
  };

  const onSubmit = (scheduleId: string) => {
    setError(null);
    const fd = new FormData();
    fd.set("scheduleId", scheduleId);
    fd.set("containers", form.containers);
    fd.set("quantity", form.quantity);
    fd.set("cargoReadyDate", form.cargoReadyDate);
    fd.set("notes", form.notes);
    startTransition(async () => {
      const res = await submitLoadingPlan(fd, locale);
      if (!res.ok) {
        setError(labels.errors[res.error] ?? labels.errors.saveFailed);
        return;
      }
      setPlanningId(null);
      setForm({ ...EMPTY_FORM });
      router.refresh();
    });
  };

  const onCancelPlan = (planId: string) => {
    setCancellingId(planId);
    startTransition(async () => {
      const res = await cancelLoadingPlan(planId, locale);
      setCancellingId(null);
      if (!res.ok) {
        setError(labels.errors[res.error] ?? labels.errors.saveFailed);
        return;
      }
      router.refresh();
    });
  };

  const inputClass =
    "h-9 w-full rounded-md border bg-white px-3 text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy";

  return (
    <div className="space-y-8">
      {/* ── Upcoming sailings ────────────────────────────── */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <Ship className="h-5 w-5 text-gold" />
          <h2 className="text-lg font-semibold text-navy">{labels.sailingsHeading}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{labels.sailingsIntro}</p>

        {error && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {upcoming.length > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="block text-xs text-muted-foreground">
              <span className="mb-1 block font-medium">{labels.pol}</span>
              <select
                className={`${inputClass} min-w-[8rem]`}
                value={filters.pol}
                onChange={(e) => setFilters((f) => ({ ...f, pol: e.target.value }))}
              >
                <option value="">{labels.filterAll}</option>
                {distinct.pols.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              <span className="mb-1 block font-medium">{labels.destination}</span>
              <select
                className={`${inputClass} min-w-[8rem]`}
                value={filters.dest}
                onChange={(e) => setFilters((f) => ({ ...f, dest: e.target.value }))}
              >
                <option value="">{labels.filterAll}</option>
                {distinct.dests.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            {distinct.commodities.length > 0 && (
              <label className="block text-xs text-muted-foreground">
                <span className="mb-1 block font-medium">{labels.commodity}</span>
                <select
                  className={`${inputClass} min-w-[8rem]`}
                  value={filters.commodity}
                  onChange={(e) => setFilters((f) => ({ ...f, commodity: e.target.value }))}
                >
                  <option value="">{labels.filterAll}</option>
                  {distinct.commodities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-xs text-muted-foreground">
              <span className="mb-1 block font-medium">{labels.filterFrom}</span>
              <input
                type="date"
                className={inputClass}
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              <span className="mb-1 block font-medium">{labels.filterTo}</span>
              <input
                type="date"
                className={inputClass}
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters({ ...EMPTY_FILTERS })}
                className="inline-flex h-9 items-center gap-1 rounded-md border bg-white px-3 text-sm font-medium text-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
                {labels.filterClear}
              </button>
            )}
          </div>
        )}

        {upcoming.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {labels.noSailings}
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {labels.noMatches}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {visible.map((s) => {
              const avail = sailingAvailability(s);
              return (
              <article key={s.id} className="rounded-lg border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                      <span>
                        {s.vessel}
                        {s.voyage && <span className="font-normal text-muted-foreground"> · {s.voyage}</span>}
                      </span>
                      {s.commodity && (
                        <span className="rounded-full border bg-white px-2 py-0.5 text-xs font-medium text-navy">
                          {s.commodity}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {s.shippingLine}
                      {s.portOfLoading || s.destination
                        ? ` · ${s.portOfLoading ?? ""}${s.portOfLoading && s.destination ? " → " : ""}${s.destination ?? ""}`
                        : ""}
                    </p>
                  </div>
                  {(() => {
                    // ONE badge per sailing: for an open sailing the
                    // date-derived availability REPLACES the status label —
                    // never show "Open" and "Closed" side by side.
                    let cls = STATUS_STYLES[s.status] ?? "";
                    let text = labels.statuses[s.status] ?? s.status;
                    if (s.status === "open" && avail.kind === "tight") {
                      cls = "bg-amber-100 text-amber-800";
                      text =
                        avail.daysToDeadline === 0
                          ? labels.badgeClosesToday
                          : labels.badgeClosesIn.replace("{days}", String(avail.daysToDeadline));
                    } else if (s.status === "open" && avail.kind === "unavailable") {
                      cls = "bg-red-100 text-red-700";
                      text = labels.badgeClosed;
                    }
                    return (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
                        {text}
                      </span>
                    );
                  })()}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
                  <div>
                    <dt className="text-xs text-muted-foreground">{labels.cargoCutoff}</dt>
                    <dd className="font-medium">
                      {(() => {
                        const cutoff = effectiveCargoCutoff(s);
                        if (!cutoff.date) return "—";
                        return (
                          <>
                            {formatDate(cutoff.date, locale)}
                            {cutoff.derived && (
                              <span className="ms-1 text-xs font-normal text-muted-foreground">
                                {labels.estimated}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{labels.docCutoff}</dt>
                    <dd className="font-medium">{s.docCutoff ? formatDate(s.docCutoff, locale) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{labels.etd}</dt>
                    <dd className="font-medium">{s.etd ? formatDate(s.etd, locale) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{labels.eta}</dt>
                    <dd className="font-medium">{s.eta ? formatDate(s.eta, locale) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{labels.transitDays}</dt>
                    <dd className="font-medium">{s.transitDays ?? "—"}</dd>
                  </div>
                </dl>

                {s.notes && <p className="mt-2 text-sm text-muted-foreground">{s.notes}</p>}

                {canSubmit && s.status === "open" && avail.kind !== "unavailable" && planningId !== s.id && (
                  <button
                    type="button"
                    onClick={() => openPlanner(s.id)}
                    className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-navy bg-navy px-3 text-sm font-medium text-white transition-colors hover:bg-navy/90"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {labels.planLoading}
                  </button>
                )}
                {(s.status === "closed" || (s.status === "open" && avail.kind === "unavailable")) && (
                  <p className="mt-3 text-xs font-medium text-amber-700">{labels.closedForBooking}</p>
                )}

                {planningId === s.id && (
                  <div className="mt-4 rounded-lg border bg-white p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-navy">
                        {labels.planFormTitle.replace("{vessel}", s.vessel)}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setPlanningId(null)}
                        disabled={pending}
                        className="rounded-md p-1 hover:bg-muted"
                        aria-label={labels.cancel}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">
                          {labels.containers}
                        </span>
                        <input
                          type="number"
                          min={1}
                          className={inputClass}
                          value={form.containers}
                          onChange={(e) => setForm((f) => ({ ...f, containers: e.target.value }))}
                          placeholder={labels.containersHint}
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">
                          {labels.quantity}
                        </span>
                        <input
                          type="text"
                          className={inputClass}
                          value={form.quantity}
                          onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                          placeholder={labels.quantityPlaceholder}
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">
                          {labels.cargoReadyDate}
                        </span>
                        <input
                          type="date"
                          className={inputClass}
                          value={form.cargoReadyDate}
                          onChange={(e) => setForm((f) => ({ ...f, cargoReadyDate: e.target.value }))}
                        />
                      </label>
                    </div>
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block text-xs font-medium text-muted-foreground">
                        {labels.notes}
                      </span>
                      <textarea
                        rows={2}
                        className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder={labels.notesPlaceholder}
                      />
                    </label>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onSubmit(s.id)}
                        disabled={pending}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-navy bg-navy px-3 text-sm font-medium text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
                      >
                        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {pending ? labels.submitting : labels.submit}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlanningId(null)}
                        disabled={pending}
                        className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
                      >
                        {labels.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── My loading plans ─────────────────────────────── */}
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-navy">{labels.myPlansHeading}</h2>
        {plans.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {labels.noPlans}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {plans.map((p) => {
              const sailing = sailingById.get(p.scheduleId);
              return (
                <article key={p.id} className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-navy">
                        {sailing ? sailing.vessel : "—"}
                        {sailing?.voyage && (
                          <span className="font-normal text-muted-foreground"> · {sailing.voyage}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {labels.submittedOn.replace("{date}", formatDate(p.createdAt, locale))}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PLAN_STATUS_STYLES[p.status] ?? ""}`}
                    >
                      {labels.planStatuses[p.status] ?? p.status}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">{labels.containers}</dt>
                      <dd className="font-medium">{p.containers ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{labels.quantity}</dt>
                      <dd className="font-medium">{p.quantity ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{labels.cargoReadyDate}</dt>
                      <dd className="font-medium">
                        {p.cargoReadyDate ? formatDate(p.cargoReadyDate, locale) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{labels.etd}</dt>
                      <dd className="font-medium">
                        {sailing?.etd ? formatDate(sailing.etd, locale) : "—"}
                      </dd>
                    </div>
                  </dl>
                  {p.notes && <p className="mt-2 text-sm text-muted-foreground">{p.notes}</p>}
                  {canSubmit && p.status === "submitted" && (
                    <button
                      type="button"
                      onClick={() => onCancelPlan(p.id)}
                      disabled={pending}
                      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
                    >
                      {cancellingId === p.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      {cancellingId === p.id ? labels.cancelling : labels.cancelPlan}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
