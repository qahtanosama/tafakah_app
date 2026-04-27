"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, CheckCircle, Loader2, Play, RefreshCw, Search, Copy } from "lucide-react";
import type { DbCounts } from "./actions";
import { getDbCounts, backfillPaymentIdsInDb } from "./actions";
import type { MigrationRun, EntityMigrationResult, MigrationEntity } from "@/lib/migration/types";
import { MIGRATION_ENTITIES } from "@/lib/migration/types";
import { runMigration, getLocalCounts, isMigrationRunning, type LocalCounts } from "@/lib/migration/migrate";
import { backfillPaymentIds } from "@/lib/finance/backfill-payment-ids";
import type { ContractFinance } from "@/types/finance";

const ENTITY_LABELS: Record<MigrationEntity, string> = {
  products: "Products",
  buyers: "Buyers",
  sellers: "Sellers",
  contracts: "Contracts",
  contract_finance: "Contract Finance",
  contract_shipping: "Contract Shipping",
  contract_documents: "Documents (metadata)",
};

export default function MigrateClient({
  initialDbCounts,
  initialDbError,
}: {
  initialDbCounts: DbCounts | null;
  initialDbError: string | null;
}) {
  const [dbCounts, setDbCounts] = useState<DbCounts | null>(initialDbCounts);
  const [dbError, setDbError] = useState<string | null>(initialDbError);
  const [localCounts, setLocalCounts] = useState<LocalCounts | null>(null);

  const [dryRunResult, setDryRunResult] = useState<MigrationRun | null>(null);
  const [migrateResult, setMigrateResult] = useState<MigrationRun | null>(null);
  const [busy, setBusy] = useState<"idle" | "dry" | "run">("idle");
  const [progress, setProgress] = useState<Partial<Record<MigrationEntity, EntityMigrationResult | "pending" | "running">>>({});
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [raceWarning, setRaceWarning] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await getLocalCounts();
        setLocalCounts(c);
      } catch (err) {
        setFatalError((err as Error).message);
      }
      if (isMigrationRunning()) setRaceWarning(true);
    })();
  }, []);

  const refreshDbCounts = useCallback(async () => {
    const resp = await getDbCounts();
    if (resp.ok) setDbCounts(resp.counts ?? null);
    else setDbError(resp.error ?? "Failed to count DB rows");
  }, []);

  const run = useCallback(async (dryRun: boolean) => {
    setFatalError(null);
    setBusy(dryRun ? "dry" : "run");
    // Initialize progress as "pending"
    const initProgress: typeof progress = {};
    for (const e of MIGRATION_ENTITIES) initProgress[e] = "pending";
    setProgress(initProgress);

    const result = await runMigration({
      dryRun,
      onProgress: (evt) => {
        setProgress((prev) => ({
          ...prev,
          [evt.entity]: evt.status === "started" ? "running" : (evt.result ?? "pending"),
        }));
      },
    });
    if (dryRun) setDryRunResult(result);
    else {
      setMigrateResult(result);
      await refreshDbCounts();
    }
    setBusy("idle");
  }, [refreshDbCounts]);

  const dryRunPassed = !!dryRunResult && dryRunResult.results.every((r) => r.failedCount === 0);
  const canStart = dryRunPassed && busy === "idle";

  return (
    <div className="space-y-6">
      {raceWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Migration may already be running in another tab/session. Wait for it to finish before starting a new run.</span>
        </div>
      )}

      {dbError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Database error: {dbError}
        </div>
      )}

      {busy === "run" && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <span><strong>Migration in progress.</strong> Do not close this tab until complete.</span>
        </div>
      )}

      {/* STEP 1 — PREVIEW */}
      <section className="rounded-xl border bg-white p-5 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">Step 1 &mdash; Preview</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity</TableHead>
                <TableHead className="text-right">Local</TableHead>
                <TableHead className="text-right">In DB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MIGRATION_ENTITIES.map((e) => (
                <TableRow key={e}>
                  <TableCell className="font-medium">{ENTITY_LABELS[e]}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{localCounts ? (localCounts[e] ?? 0) : "\u2014"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{dbCounts ? (dbCounts[e] ?? 0) : "\u2014"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy !== "idle"} onClick={() => run(true)} className="gap-1">
            {busy === "dry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {busy === "dry" ? "Running dry run..." : "Run Dry Run"}
          </Button>
          <Button disabled={!canStart} onClick={() => run(false)} className="gap-1">
            {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {busy === "run" ? "Migrating..." : "Start Migration"}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy !== "idle"} onClick={refreshDbCounts} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh DB counts
          </Button>
        </div>
        {!dryRunPassed && dryRunResult && (
          <p className="mt-2 text-xs text-red-600">Dry run reported failures. Review and fix below before starting migration.</p>
        )}
      </section>

      {/* STEP 2 — DRY RUN RESULTS */}
      {dryRunResult && (
        <ResultsSection title="Step 2 &mdash; Dry Run Results" run={dryRunResult} />
      )}

      {/* STEP 3 — PROGRESS (live while migrating) */}
      {busy === "run" && (
        <section className="rounded-xl border bg-white p-5 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold">Step 3 &mdash; Migration Progress</h2>
          <ul className="space-y-1 text-sm">
            {MIGRATION_ENTITIES.map((e) => {
              const v = progress[e];
              if (v === "pending") return <li key={e} className="flex items-center gap-2 text-zinc-400"><span className="h-2 w-2 rounded-full bg-zinc-300" /> {ENTITY_LABELS[e]}</li>;
              if (v === "running") return <li key={e} className="flex items-center gap-2 text-blue-600"><Loader2 className="h-3 w-3 animate-spin" /> Migrating {ENTITY_LABELS[e]}...</li>;
              if (v && typeof v !== "string") return (
                <li key={e} className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle className="h-3 w-3" /> {ENTITY_LABELS[e]} &mdash; {v.migratedCount}/{v.localCount}
                  {v.skippedExisting > 0 && <span className="text-zinc-400">({v.skippedExisting} existing)</span>}
                  {v.failedCount > 0 && <span className="text-red-600">({v.failedCount} failed)</span>}
                </li>
              );
              return null;
            })}
          </ul>
        </section>
      )}

      {/* STEP 4 — VERIFICATION */}
      {migrateResult && (
        <ResultsSection title="Step 4 &mdash; Migration Complete" run={migrateResult} dbCounts={dbCounts} />
      )}

      {fatalError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {fatalError}
        </div>
      )}

      {/* Backfill payment ids */}
      <section className="rounded-xl border bg-white p-5 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold">Backfill payment ids</h2>
        <p className="mb-3 text-sm text-slate-500">
          Older payments may not have stable ids, which receipts need. This is idempotent &mdash; safe to run any time.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={backfillBusy}
          onClick={async () => {
            setBackfillBusy(true);
            setBackfillMsg(null);
            try {
              // Local
              let localFiles = 0;
              let localPayments = 0;
              try {
                const raw = localStorage.getItem("contract-finance");
                if (raw) {
                  const arr = JSON.parse(raw) as ContractFinance[];
                  let mutated = false;
                  const next = arr.map((f) => {
                    const before = (f.payments ?? []).filter((p) => !p.id).length;
                    const { changed, record } = backfillPaymentIds(f);
                    if (changed) {
                      mutated = true;
                      localFiles++;
                      localPayments += before;
                    }
                    return record;
                  });
                  if (mutated) localStorage.setItem("contract-finance", JSON.stringify(next));
                }
              } catch (e) {
                console.error("local backfill failed", e);
              }

              // DB
              const dbResp = await backfillPaymentIdsInDb();
              if (!dbResp.ok) {
                setBackfillMsg(`DB error: ${dbResp.error ?? "unknown"} (local: ${localFiles} record(s), ${localPayments} payment(s) updated)`);
              } else {
                setBackfillMsg(
                  `Local: ${localFiles} record(s), ${localPayments} payment(s) updated. DB: ${dbResp.updated}/${dbResp.scanned} record(s), ${dbResp.paymentsTouched} payment(s) updated.`,
                );
              }
            } finally {
              setBackfillBusy(false);
            }
          }}
          className="gap-1"
        >
          {backfillBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Backfill payment ids
        </Button>
        {backfillMsg && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
            {backfillMsg}
          </p>
        )}
      </section>

      {/* Re-run section */}
      {migrateResult?.status === "success" && (
        <section className="rounded-xl border border-dashed bg-white p-5 dark:bg-zinc-900">
          <h3 className="mb-2 text-sm font-semibold">Sync new data</h3>
          <p className="mb-3 text-xs text-slate-500">
            If you&rsquo;ve added data in localStorage since the last migration, re-run to sync new items.
            Existing DB rows are detected and skipped.
          </p>
          <Button variant="outline" size="sm" disabled={busy !== "idle"} onClick={() => run(false)} className="gap-1">
            {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Sync new data
          </Button>
        </section>
      )}
    </div>
  );
}

function ResultsSection({ title, run, dbCounts }: { title: string; run: MigrationRun; dbCounts?: DbCounts | null }) {
  const [copyFlash, setCopyFlash] = useState(false);

  const copyErrors = async () => {
    const text = JSON.stringify(run, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1500);
    } catch { /* ignore */ }
  };

  const statusColor =
    run.status === "success" ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
    run.status === "partial" ? "text-amber-700 bg-amber-50 border-amber-200" :
    run.status === "failed" ? "text-red-700 bg-red-50 border-red-200" :
    "text-slate-700 bg-slate-50 border-slate-200";

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" dangerouslySetInnerHTML={{ __html: title }} />
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusColor}`}>
          {run.status}{run.dryRun && " (dry run)"}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Entity</TableHead>
            <TableHead className="text-right">Local</TableHead>
            <TableHead className="text-right">Migrated</TableHead>
            <TableHead className="text-right">Skipped (existing)</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            {dbCounts && <TableHead className="text-right">DB total</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {run.results.map((r) => (
            <TableRow key={r.entity}>
              <TableCell className="font-medium">{ENTITY_LABELS[r.entity]}</TableCell>
              <TableCell className="text-right font-mono">{r.localCount}</TableCell>
              <TableCell className="text-right font-mono text-emerald-600">{r.migratedCount}</TableCell>
              <TableCell className="text-right font-mono text-zinc-500">{r.skippedExisting}</TableCell>
              <TableCell className={`text-right font-mono ${r.failedCount > 0 ? "text-red-600" : ""}`}>{r.failedCount}</TableCell>
              {dbCounts && <TableCell className="text-right font-mono">{dbCounts[r.entity]}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {run.results.some((r) => r.errors.length > 0) && (
        <details className="rounded-lg border bg-zinc-50 p-3 dark:bg-zinc-800">
          <summary className="cursor-pointer text-sm font-medium text-red-700">Errors ({run.results.reduce((s, r) => s + r.errors.length, 0)})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {run.results.flatMap((r) =>
              r.errors.map((e, i) => (
                <li key={`${r.entity}-${i}`}>
                  <span className="font-mono text-zinc-500">[{r.entity}]</span> {e.id && <span className="font-mono">{e.id}:</span>} {e.message}
                </li>
              ))
            )}
          </ul>
          <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={copyErrors}>
            <Copy className="h-3 w-3" /> {copyFlash ? "Copied" : "Copy full report"}
          </Button>
        </details>
      )}

      {run.status === "success" && !run.dryRun && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <strong>Migration complete.</strong> Your data is now in Supabase AND your localStorage (as backup).
          The app still reads from localStorage. A follow-up prompt will switch reads to the DB.
        </p>
      )}
      {run.status === "success" && run.dryRun && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Dry run passed. Ready to migrate.
        </p>
      )}
    </section>
  );
}
