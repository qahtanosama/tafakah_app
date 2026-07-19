"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, Ship, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  SAILING_STATUSES,
  type LoadingPlanWithContext,
  type SailingInput,
  type SailingScheduleWithInternal,
  type SailingStatus,
} from "@/types/schedule";
import { EMPTY_SAILING, parseScheduleWorkbook } from "@/lib/schedule-excel";
import { sailingAvailability } from "@/lib/schedule-availability";
import {
  deleteSailing,
  importSailings,
  setLoadingPlanStatus,
  setSailingStatus,
  updateSailing,
} from "@/lib/schedules";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const SAILING_STATUS_STYLES: Record<SailingStatus, string> = {
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

/**
 * Date-derived booking flag shown UNDER the status dropdown for open
 * sailings. Wording says what happened to the dates ("Cut-off passed"),
 * never a second status — the dropdown stays the only status control.
 */
function AvailabilityFlag({ s }: { s: SailingScheduleWithInternal }) {
  if (s.status !== "open") return null;
  const a = sailingAvailability(s);
  if (a.kind === "tight") {
    return (
      <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        {a.daysToDeadline === 0 ? "Closes today" : `Closes in ${a.daysToDeadline}d`}
      </span>
    );
  }
  if (a.kind === "unavailable") {
    return (
      <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Cut-off passed — hidden from booking
      </span>
    );
  }
  return null;
}

const EMPTY_FILTERS = { q: "", pol: "all", pod: "all", commodity: "all", status: "all", from: "", to: "" };

interface Props {
  sailings: SailingScheduleWithInternal[];
  plans: LoadingPlanWithContext[];
}

export default function SchedulesManager({ sailings, plans }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<SailingInput[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<SailingInput | null>(null);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [sort, setSort] = useState<{ key: "etd" | "eta" | "line"; dir: 1 | -1 }>({ key: "etd", dir: 1 });

  const distinct = useMemo(() => {
    const pick = (fn: (s: SailingScheduleWithInternal) => string | null) =>
      Array.from(new Set(sailings.map(fn).filter((v): v is string => !!v))).sort();
    return {
      pols: pick((s) => s.portOfLoading),
      pods: pick((s) => s.destination),
      commodities: pick((s) => s.commodity),
    };
  }, [sailings]);

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const visibleSailings = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const rows = sailings.filter((s) => {
      if (
        q &&
        ![s.vessel, s.voyage, s.shippingLine, s.portOfLoading, s.destination, s.commodity].some(
          (v) => v?.toLowerCase().includes(q),
        )
      )
        return false;
      if (filters.pol !== "all" && s.portOfLoading !== filters.pol) return false;
      if (filters.pod !== "all" && s.destination !== filters.pod) return false;
      if (filters.commodity !== "all" && s.commodity !== filters.commodity) return false;
      if (filters.status !== "all" && s.status !== filters.status) return false;
      // ETD range: YYYY-MM-DD strings compare lexicographically.
      if (filters.from && (!s.etd || s.etd < filters.from)) return false;
      if (filters.to && (!s.etd || s.etd > filters.to)) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      if (sort.key === "line") return a.shippingLine.localeCompare(b.shippingLine) * sort.dir;
      const av = a[sort.key];
      const bv = b[sort.key];
      if (!av && !bv) return 0;
      if (!av) return 1; // missing dates always sink to the bottom
      if (!bv) return -1;
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
    });
  }, [sailings, filters, sort]);

  function toggleSort(key: "etd" | "eta" | "line") {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  const sortMark = (key: "etd" | "eta" | "line") =>
    sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "";

  function note(ok: string | null, err: string | null) {
    setMessage(ok);
    setError(err);
  }

  async function onFile(file: File) {
    note(null, null);
    try {
      const parsed = parseScheduleWorkbook(await file.arrayBuffer());
      if (!parsed.rows.length) {
        note(null, "Could not find a schedule table in that sheet — check the file, or add rows manually below.");
        setPreview([{ ...EMPTY_SAILING }]);
        setUnmatched([]);
        return;
      }
      setPreview(parsed.rows);
      setUnmatched(parsed.unmatched);
    } catch {
      note(null, "That file could not be read as an Excel sheet.");
    }
  }

  function setPreviewField(index: number, field: keyof SailingInput, value: string) {
    setPreview((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value || null } : row)),
    );
  }

  function setPreviewDays(index: number, value: string) {
    const n = parseInt(value, 10);
    setPreview((rows) =>
      rows.map((row, i) =>
        i === index ? { ...row, transitDays: Number.isFinite(n) && n >= 0 ? n : null } : row,
      ),
    );
  }

  function runImport() {
    note(null, null);
    startTransition(async () => {
      const result = await importSailings(
        preview.map((row) => ({ ...row, shippingLine: row.shippingLine ?? "", vessel: row.vessel ?? "" })),
      );
      if (!result.ok) return note(null, result.error);
      note(
        `Imported ${result.inserted} new sailing(s), updated ${result.updated}.` +
          (result.skipped ? ` Skipped ${result.skipped} row(s) missing shipping line or vessel.` : ""),
        null,
      );
      setPreview([]);
      setUnmatched([]);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function beginEdit(s: SailingScheduleWithInternal) {
    setEditingId(s.id);
    setEditRow({
      shippingLine: s.shippingLine,
      vessel: s.vessel,
      voyage: s.voyage,
      portOfLoading: s.portOfLoading,
      destination: s.destination,
      etd: s.etd,
      eta: s.eta,
      cargoCutoff: s.cargoCutoff,
      docCutoff: s.docCutoff,
      transitDays: s.transitDays,
      commodity: s.commodity,
      notes: s.notes,
      oceanFreight: s.internal?.oceanFreight ?? null,
      bookingPlan: s.internal?.bookingPlan ?? null,
      spaceRelease: s.internal?.spaceReleaseStatus ?? null,
      remark: s.internal?.remark ?? null,
    });
  }

  function saveEdit(id: string) {
    if (!editRow) return;
    startTransition(async () => {
      const result = await updateSailing(id, editRow);
      if (!result.ok) return note(null, result.error);
      setEditingId(null);
      setEditRow(null);
      router.refresh();
    });
  }

  function changeStatus(id: string, status: SailingStatus) {
    startTransition(async () => {
      const result = await setSailingStatus(id, status);
      if (!result.ok) return note(null, result.error);
      router.refresh();
    });
  }

  function removeSailing(id: string, vessel: string) {
    if (!window.confirm(`Delete sailing "${vessel}"? Client loading plans on it are deleted too.`)) return;
    startTransition(async () => {
      const result = await deleteSailing(id);
      if (!result.ok) return note(null, result.error);
      router.refresh();
    });
  }

  function changePlanStatus(id: string, status: "confirmed" | "booked" | "declined" | "submitted") {
    startTransition(async () => {
      const result = await setLoadingPlanStatus(id, status);
      if (!result.ok) return note(null, result.error);
      router.refresh();
    });
  }

  const dateInput = (row: SailingInput, field: keyof SailingInput, onChange: (v: string) => void) => (
    <Input
      type="date"
      className="h-8 min-w-[8.5rem]"
      value={(row[field] as string | null) ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  const textInput = (
    value: string | null,
    onChange: (v: string) => void,
    placeholder?: string,
  ) => (
    <Input
      className="h-8 min-w-[7rem]"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  const pendingPlans = plans.filter((p) => p.status === "submitted").length;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-8">
      {(message || error) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? message}
        </div>
      )}

      {/* ── Import from Excel ────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Import weekly schedule</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Upload the carrier Excel sheet — rows are matched by vessel + voyage, so
                re-uploading a corrected sheet updates instead of duplicating.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}>
                <Upload className="mr-2 h-4 w-4" /> Choose Excel file
              </Button>
              <Button
                variant="outline"
                onClick={() => setPreview((rows) => [...rows, { ...EMPTY_SAILING }])}
                disabled={pending}
              >
                <Plus className="mr-2 h-4 w-4" /> Add row manually
              </Button>
            </div>
          </div>

          {preview.length > 0 && (
            <div className="space-y-3">
              {unmatched.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Columns not detected in the sheet (fill in below if needed): {unmatched.join(", ")}
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line*</TableHead>
                      <TableHead>Vessel*</TableHead>
                      <TableHead>Voyage</TableHead>
                      <TableHead>POL</TableHead>
                      <TableHead>POD</TableHead>
                      <TableHead>Commodity</TableHead>
                      <TableHead>Cargo cut-off</TableHead>
                      <TableHead>Doc cut-off</TableHead>
                      <TableHead>ETD</TableHead>
                      <TableHead>ETA</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Ocean freight (internal)</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{textInput(row.shippingLine, (v) => setPreviewField(i, "shippingLine", v), "e.g. CMA")}</TableCell>
                        <TableCell>{textInput(row.vessel, (v) => setPreviewField(i, "vessel", v), "TBN if unknown")}</TableCell>
                        <TableCell>{textInput(row.voyage, (v) => setPreviewField(i, "voyage", v))}</TableCell>
                        <TableCell>{textInput(row.portOfLoading, (v) => setPreviewField(i, "portOfLoading", v))}</TableCell>
                        <TableCell>{textInput(row.destination, (v) => setPreviewField(i, "destination", v))}</TableCell>
                        <TableCell>{textInput(row.commodity, (v) => setPreviewField(i, "commodity", v))}</TableCell>
                        <TableCell>{dateInput(row, "cargoCutoff", (v) => setPreviewField(i, "cargoCutoff", v))}</TableCell>
                        <TableCell>{dateInput(row, "docCutoff", (v) => setPreviewField(i, "docCutoff", v))}</TableCell>
                        <TableCell>{dateInput(row, "etd", (v) => setPreviewField(i, "etd", v))}</TableCell>
                        <TableCell>{dateInput(row, "eta", (v) => setPreviewField(i, "eta", v))}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-20"
                            value={row.transitDays ?? ""}
                            onChange={(e) => setPreviewDays(i, e.target.value)}
                          />
                        </TableCell>
                        <TableCell>{textInput(row.oceanFreight, (v) => setPreviewField(i, "oceanFreight", v))}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreview((rows) => rows.filter((_, j) => j !== i))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={runImport} disabled={pending}>
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ship className="mr-2 h-4 w-4" />}
                  Import {preview.length} sailing(s)
                </Button>
                <Button variant="ghost" onClick={() => { setPreview([]); setUnmatched([]); }} disabled={pending}>
                  Discard
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Published sailings ───────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Published sailings</h2>
            {sailings.length > 0 && (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {visibleSailings.length} of {sailings.length}
              </span>
            )}
          </div>

          {sailings.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-9 w-56 ps-8"
                  placeholder="Search vessel, voyage, line…"
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                />
              </div>
              <Select value={filters.pol} onValueChange={(v) => setFilters((f) => ({ ...f, pol: v ?? "all" }))}>
                <SelectTrigger className="h-9 w-36"><SelectValue placeholder="POL" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All POL</SelectItem>
                  {distinct.pols.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.pod} onValueChange={(v) => setFilters((f) => ({ ...f, pod: v ?? "all" }))}>
                <SelectTrigger className="h-9 w-36"><SelectValue placeholder="POD" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All POD</SelectItem>
                  {distinct.pods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.commodity} onValueChange={(v) => setFilters((f) => ({ ...f, commodity: v ?? "all" }))}>
                <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Commodity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All commodities</SelectItem>
                  {distinct.commodities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v ?? "all" }))}>
                <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {SAILING_STATUSES.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                ETD
                <Input
                  type="date"
                  className="h-9 w-36"
                  value={filters.from}
                  onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                />
                –
                <Input
                  type="date"
                  className="h-9 w-36"
                  value={filters.to}
                  onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                />
              </label>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
                  <X className="me-1 h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
          )}

          {sailings.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No sailings yet — import the weekly Excel sheet above.
            </p>
          ) : visibleSailings.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No sailings match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("line")}>
                      Line{sortMark("line")}
                    </TableHead>
                    <TableHead>Vessel / Voyage</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Commodity</TableHead>
                    <TableHead>Cargo cut-off</TableHead>
                    <TableHead>Doc cut-off</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("etd")}>
                      ETD{sortMark("etd")}
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("eta")}>
                      ETA{sortMark("eta")}
                    </TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Ocean freight (internal)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSailings.map((s) =>
                    editingId === s.id && editRow ? (
                      <TableRow key={s.id}>
                        <TableCell>{textInput(editRow.shippingLine, (v) => setEditRow({ ...editRow, shippingLine: v }))}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {textInput(editRow.vessel, (v) => setEditRow({ ...editRow, vessel: v }))}
                            {textInput(editRow.voyage, (v) => setEditRow({ ...editRow, voyage: v || null }), "Voy")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {textInput(editRow.portOfLoading, (v) => setEditRow({ ...editRow, portOfLoading: v || null }), "POL")}
                            {textInput(editRow.destination, (v) => setEditRow({ ...editRow, destination: v || null }), "POD")}
                          </div>
                        </TableCell>
                        <TableCell>{textInput(editRow.commodity, (v) => setEditRow({ ...editRow, commodity: v || null }))}</TableCell>
                        <TableCell>{dateInput(editRow, "cargoCutoff", (v) => setEditRow({ ...editRow, cargoCutoff: v || null }))}</TableCell>
                        <TableCell>{dateInput(editRow, "docCutoff", (v) => setEditRow({ ...editRow, docCutoff: v || null }))}</TableCell>
                        <TableCell>{dateInput(editRow, "etd", (v) => setEditRow({ ...editRow, etd: v || null }))}</TableCell>
                        <TableCell>{dateInput(editRow, "eta", (v) => setEditRow({ ...editRow, eta: v || null }))}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-20"
                            value={editRow.transitDays ?? ""}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              setEditRow({ ...editRow, transitDays: Number.isFinite(n) && n >= 0 ? n : null });
                            }}
                          />
                        </TableCell>
                        <TableCell>{textInput(editRow.oceanFreight, (v) => setEditRow({ ...editRow, oceanFreight: v || null }))}</TableCell>
                        <TableCell colSpan={2}>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveEdit(s.id)} disabled={pending}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditRow(null); }}>Cancel</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.shippingLine}</TableCell>
                        <TableCell>
                          {s.vessel}
                          {s.voyage ? <span className="text-slate-500"> · {s.voyage}</span> : null}
                        </TableCell>
                        <TableCell>
                          {s.portOfLoading || s.destination
                            ? `${s.portOfLoading ?? "?"} → ${s.destination ?? "?"}`
                            : "—"}
                        </TableCell>
                        <TableCell>{s.commodity ?? "—"}</TableCell>
                        <TableCell>{fmtDate(s.cargoCutoff)}</TableCell>
                        <TableCell>{fmtDate(s.docCutoff)}</TableCell>
                        <TableCell>{fmtDate(s.etd)}</TableCell>
                        <TableCell>{fmtDate(s.eta)}</TableCell>
                        <TableCell>{s.transitDays ?? "—"}</TableCell>
                        <TableCell className="max-w-[14rem]">
                          <span className="block truncate" title={s.internal?.oceanFreight ?? undefined}>
                            {s.internal?.oceanFreight ?? "—"}
                          </span>
                          {s.internal?.remark && (
                            <span className="block truncate text-xs text-slate-500" title={s.internal.remark}>
                              {s.internal.remark}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select value={s.status} onValueChange={(v) => changeStatus(s.id, v as SailingStatus)}>
                            <SelectTrigger className={`h-8 w-32 border-0 ${SAILING_STATUS_STYLES[s.status]}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SAILING_STATUSES.map((st) => (
                                <SelectItem key={st} value={st}>{st}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <AvailabilityFlag s={s} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => beginEdit(s)} disabled={pending}>
                              Edit
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeSailing(s.id, s.vessel)}
                              disabled={pending}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Client loading plans ─────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Client loading plans</h2>
            {pendingPlans > 0 && (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                {pendingPlans} new
              </span>
            )}
          </div>
          {plans.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No loading plans submitted yet. Clients submit plans from the portal schedule page.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Sailing</TableHead>
                    <TableHead>Containers</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Cargo ready</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.buyerName ?? "—"}</TableCell>
                      <TableCell>
                        {p.sailing ? (
                          <>
                            {p.sailing.vessel}
                            {p.sailing.voyage ? ` · ${p.sailing.voyage}` : ""}
                            <span className="block text-xs text-slate-500">
                              {p.sailing.shippingLine} — ETD {fmtDate(p.sailing.etd)}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{p.containers ?? "—"}</TableCell>
                      <TableCell className="max-w-[10rem] truncate" title={p.quantity ?? undefined}>{p.quantity ?? "—"}</TableCell>
                      <TableCell>{fmtDate(p.cargoReadyDate)}</TableCell>
                      <TableCell className="max-w-[12rem] truncate" title={p.notes ?? undefined}>{p.notes ?? "—"}</TableCell>
                      <TableCell>{fmtDate(p.createdAt)}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PLAN_STATUS_STYLES[p.status] ?? ""}`}>
                          {p.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {p.status === "submitted" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => changePlanStatus(p.id, "confirmed")} disabled={pending}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => changePlanStatus(p.id, "declined")} disabled={pending}>
                              Decline
                            </Button>
                          </div>
                        )}
                        {p.status === "confirmed" && (
                          <Button size="sm" variant="outline" onClick={() => changePlanStatus(p.id, "booked")} disabled={pending}>
                            Mark booked
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
