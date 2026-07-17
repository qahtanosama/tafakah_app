"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Loader2, X, ImagePlus, PackageCheck, Trash2 } from "lucide-react";
import { submitArrivalReport, deleteArrivalReport } from "@/lib/portal/arrival-reports";
import {
  ARRIVAL_CONDITIONS,
  ARRIVAL_ISSUE_TAGS,
  type ArrivalReportWithPhotos,
} from "@/types/arrival-report";
import { formatDate, type AppLocale } from "@/lib/i18n/format";

export interface ArrivalReportLabels {
  heading: string;
  intro: string;
  addReport: string;
  edit: string;
  delete: string;
  deleteConfirm: string;
  deleteYes: string;
  deleting: string;
  cancel: string;
  save: string;
  saving: string;
  noReports: string;
  container: string;
  containerNone: string;
  arrivalDate: string;
  damagedBoxes: string;
  totalBoxes: string;
  condition: string;
  conditions: Record<string, string>; // good/fair/poor
  issues: string;
  tags: Record<string, string>; // rot/mould/sprouting/over-ripe
  comments: string;
  commentsPlaceholder: string;
  photos: string;
  addPhotos: string;
  photosHint: string;
  selectedCount: string; // "{count} selected"
  reportedOn: string; // "Reported {date}"
  errors: Record<string, string>;
}

interface Props {
  contractId: string;
  locale: AppLocale;
  /** Auth id of the viewer — only their OWN reports get edit/delete controls. */
  currentUserId: string;
  containerNumbers: string[];
  reports: ArrivalReportWithPhotos[];
  labels: ArrivalReportLabels;
}

const EMPTY = {
  reportId: "" as string,
  containerNumber: "",
  arrivalDate: "",
  damagedBoxes: "",
  totalBoxes: "",
  condition: "",
  issueTags: [] as string[],
  comments: "",
};

export default function ArrivalReportSection({
  contractId,
  locale,
  currentUserId,
  containerNumbers,
  reports,
  labels,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileCount, setFileCount] = useState(0);
  // Which report is showing its "are you sure?" confirm, and delete in-flight.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onDelete = (reportId: string) => {
    setDeleteError(null);
    setDeletingId(reportId);
    startTransition(async () => {
      const res = await deleteArrivalReport(reportId, locale);
      setDeletingId(null);
      if (!res.ok) {
        setDeleteError(labels.errors[res.error] ?? labels.errors.deleteFailed);
        return;
      }
      setConfirmingId(null);
      router.refresh();
    });
  };

  const openNew = () => {
    setForm({ ...EMPTY });
    setError(null);
    setFileCount(0);
    if (fileRef.current) fileRef.current.value = "";
    setOpen(true);
  };

  const openEdit = (r: ArrivalReportWithPhotos) => {
    setForm({
      reportId: r.id,
      containerNumber: r.containerNumber ?? "",
      arrivalDate: r.arrivalDate ?? "",
      damagedBoxes: r.damagedBoxes != null ? String(r.damagedBoxes) : "",
      totalBoxes: r.totalBoxes != null ? String(r.totalBoxes) : "",
      condition: r.condition ?? "",
      issueTags: [...r.issueTags],
      comments: r.comments ?? "",
    });
    setError(null);
    setFileCount(0);
    if (fileRef.current) fileRef.current.value = "";
    setOpen(true);
  };

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };

  const toggleTag = (tag: string) =>
    setForm((f) => ({
      ...f,
      issueTags: f.issueTags.includes(tag)
        ? f.issueTags.filter((t) => t !== tag)
        : [...f.issueTags, tag],
    }));

  const onSubmit = () => {
    setError(null);
    const fd = new FormData();
    fd.set("contractId", contractId);
    if (form.reportId) fd.set("reportId", form.reportId);
    fd.set("containerNumber", form.containerNumber);
    fd.set("arrivalDate", form.arrivalDate);
    fd.set("damagedBoxes", form.damagedBoxes);
    fd.set("totalBoxes", form.totalBoxes);
    fd.set("condition", form.condition);
    form.issueTags.forEach((t) => fd.append("issueTags", t));
    fd.set("comments", form.comments);
    const files = fileRef.current?.files;
    if (files) for (const file of Array.from(files)) fd.append("photos", file);

    startTransition(async () => {
      const res = await submitArrivalReport(fd, locale);
      if (!res.ok) {
        setError(labels.errors[res.error] ?? labels.errors.saveFailed);
        return;
      }
      setOpen(false);
      setForm({ ...EMPTY });
      setFileCount(0);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-gold" />
          <h2 className="text-lg font-semibold text-navy">{labels.heading}</h2>
        </div>
        {!open && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-navy bg-navy px-3 text-sm font-medium text-white transition-colors hover:bg-navy/90"
          >
            <Plus className="h-3.5 w-3.5" />
            {labels.addReport}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{labels.intro}</p>

      {/* Existing reports */}
      <div className="mt-4 space-y-3">
        {reports.length === 0 && !open ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {labels.noReports}
          </p>
        ) : (
          reports.map((r) => (
            <article key={r.id} className="rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {r.containerNumber && (
                    <span className="rounded-md border bg-white px-2 py-0.5 font-mono text-sm">
                      {r.containerNumber}
                    </span>
                  )}
                  {r.condition && (
                    <span className={conditionClass(r.condition)}>
                      {labels.conditions[r.condition] ?? r.condition}
                    </span>
                  )}
                  {r.arrivalDate && (
                    <span className="text-sm text-muted-foreground">
                      {formatDate(r.arrivalDate, locale)}
                    </span>
                  )}
                </div>
                {r.createdBy === currentUserId &&
                  (confirmingId === r.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{labels.deleteConfirm}</span>
                      <button
                        type="button"
                        onClick={() => onDelete(r.id)}
                        disabled={pending}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        {deletingId === r.id ? labels.deleting : labels.deleteYes}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingId(null);
                          setDeleteError(null);
                        }}
                        disabled={pending}
                        className="inline-flex h-8 items-center rounded-md border bg-white px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
                      >
                        {labels.cancel}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <Pencil className="h-3 w-3" />
                        {labels.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingId(r.id);
                          setDeleteError(null);
                        }}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        {labels.delete}
                      </button>
                    </div>
                  ))}
              </div>
              {deleteError && confirmingId === r.id && (
                <p className="mt-2 text-sm text-red-600">{deleteError}</p>
              )}

              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                {(r.damagedBoxes != null || r.totalBoxes != null) && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {labels.damagedBoxes} / {labels.totalBoxes}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {r.damagedBoxes ?? "—"} / {r.totalBoxes ?? "—"}
                    </dd>
                  </div>
                )}
                {r.issueTags.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {labels.issues}
                    </dt>
                    <dd className="mt-0.5 flex flex-wrap gap-1.5">
                      {r.issueTags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                        >
                          {labels.tags[t] ?? t}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>

              {r.comments && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{r.comments}</p>
              )}

              {r.photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.photos.map((p) => (
                    <a
                      key={p.path}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-20 w-20 overflow-hidden rounded-md border bg-white"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {/* Form */}
      {open && (
        <div className="mt-4 rounded-lg border border-navy/30 bg-navy/[0.02] p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy">
              {form.reportId ? labels.edit : labels.addReport}
            </h3>
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
              aria-label={labels.cancel}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* Container */}
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.container}
              </span>
              <select
                value={form.containerNumber}
                onChange={(e) => setForm((f) => ({ ...f, containerNumber: e.target.value }))}
                disabled={pending}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">{labels.containerNone}</option>
                {containerNumbers.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            {/* Arrival date */}
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.arrivalDate}
              </span>
              <input
                type="date"
                value={form.arrivalDate}
                onChange={(e) => setForm((f) => ({ ...f, arrivalDate: e.target.value }))}
                disabled={pending}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>

            {/* Damaged boxes */}
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.damagedBoxes}
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={form.damagedBoxes}
                onChange={(e) => setForm((f) => ({ ...f, damagedBoxes: e.target.value }))}
                disabled={pending}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>

            {/* Total boxes */}
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {labels.totalBoxes}
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={form.totalBoxes}
                onChange={(e) => setForm((f) => ({ ...f, totalBoxes: e.target.value }))}
                disabled={pending}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
          </div>

          {/* Condition */}
          <fieldset className="mt-4" disabled={pending}>
            <legend className="text-xs uppercase tracking-wide text-muted-foreground">
              {labels.condition}
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {ARRIVAL_CONDITIONS.map((c) => (
                <label
                  key={c}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm font-medium ${
                    form.condition === c
                      ? "border-navy bg-navy text-white"
                      : "bg-white text-foreground hover:bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="condition"
                    value={c}
                    checked={form.condition === c}
                    onChange={() => setForm((f) => ({ ...f, condition: c }))}
                    className="sr-only"
                  />
                  {labels.conditions[c] ?? c}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Issue tags */}
          <fieldset className="mt-4" disabled={pending}>
            <legend className="text-xs uppercase tracking-wide text-muted-foreground">
              {labels.issues}
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {ARRIVAL_ISSUE_TAGS.map((tag) => (
                <label
                  key={tag}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm font-medium ${
                    form.issueTags.includes(tag)
                      ? "border-amber-500 bg-amber-100 text-amber-800"
                      : "bg-white text-foreground hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.issueTags.includes(tag)}
                    onChange={() => toggleTag(tag)}
                    className="sr-only"
                  />
                  {labels.tags[tag] ?? tag}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Comments */}
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {labels.comments}
            </span>
            <textarea
              value={form.comments}
              onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
              disabled={pending}
              rows={3}
              placeholder={labels.commentsPlaceholder}
              className="mt-1 w-full rounded-lg border border-input bg-white px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>

          {/* Photos */}
          <div className="mt-4">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {labels.photos}
            </span>
            <div className="mt-1.5 flex items-center gap-3">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border bg-white px-3 text-sm font-medium text-foreground hover:bg-muted">
                <ImagePlus className="h-4 w-4" />
                {labels.addPhotos}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={pending}
                  onChange={(e) => setFileCount(e.target.files?.length ?? 0)}
                  className="sr-only"
                />
              </label>
              {fileCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  {labels.selectedCount.replace("{count}", String(fileCount))}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{labels.photosHint}</p>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="inline-flex h-9 items-center rounded-md border bg-white px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-navy bg-navy px-4 text-sm font-medium text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {pending ? labels.saving : labels.save}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function conditionClass(condition: string): string {
  const base = "rounded-full px-2 py-0.5 text-xs font-semibold ";
  if (condition === "good") return base + "bg-green-100 text-green-800";
  if (condition === "fair") return base + "bg-yellow-100 text-yellow-800";
  return base + "bg-red-100 text-red-800";
}
