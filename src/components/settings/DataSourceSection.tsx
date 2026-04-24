"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Cloud, Database, Loader2, RefreshCw, Trash2, Wrench } from "lucide-react";
import {
  FLAG_METADATA, FLAG_GROUPS, useAllFlags, setFlag, type FeatureFlag,
} from "@/lib/feature-flags";
import { useRetryQueue } from "@/components/retry-queue/RetryQueueProvider";

type MigrationResult = { name: string; status: "ok" | "error"; error?: string };
type MigrationState = { running: boolean; done: boolean; results: MigrationResult[]; error?: string };

export default function DataSourceSection() {
  const flags = useAllFlags();
  const { pending, syncing, retry, removeOne, clearAll, isOnline } = useRetryQueue();
  const [confirming, setConfirming] = useState<"clear" | null>(null);
  const [migration, setMigration] = useState<MigrationState>({ running: false, done: false, results: [] });

  async function runMigration() {
    setMigration({ running: true, done: false, results: [] });
    try {
      const res = await fetch("/api/admin/migrate-schema", { method: "POST" });
      const json = await res.json();
      setMigration({ running: false, done: true, results: json.results ?? [], error: json.error });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMigration({ running: false, done: true, results: [], error: msg });
    }
  }

  const groups = useMemo(() => {
    const map: Record<string, FeatureFlag[]> = {};
    (Object.keys(FLAG_METADATA) as FeatureFlag[]).forEach((f) => {
      const g = FLAG_METADATA[f].group;
      if (!map[g]) map[g] = [];
      map[g].push(f);
    });
    return map;
  }, []);

  return (
    <div id="data-source" className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Cloud className="h-5 w-5 text-indigo-600" /> Data Source
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Toggle each feature between localStorage and Supabase. Your localStorage data stays as a backup — flip back anytime.
          Run <a href="/admin/migrate" className="text-indigo-600 hover:underline">/admin/migrate</a> if you add new local data and want it pushed to the cloud.
        </p>
      </div>

      {FLAG_GROUPS.map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-base">{group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(groups[group] ?? []).map((flag) => {
              const meta = FLAG_METADATA[flag];
              const on = flags[flag];
              return (
                <div key={flag} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${meta.disabled ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{meta.label}</p>
                      {meta.disabled && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-500 dark:bg-zinc-800">Coming in next update</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{meta.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${on ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
                      {on ? "Cloud" : "Local"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      disabled={!!meta.disabled}
                      onClick={() => setFlag(flag, !on)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-indigo-600" : "bg-zinc-300"} ${meta.disabled ? "cursor-not-allowed opacity-50" : "hover:opacity-90"}`}
                      title={meta.disabled ? "This feature isn't switched over yet" : on ? "Switch to localStorage" : "Switch to Supabase"}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* ═══ SCHEMA MIGRATION ═══ */}
      <Card id="schema-migration">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" /> Database Schema
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={runMigration}
            disabled={migration.running}
            className="gap-1.5 font-semibold"
          >
            {migration.running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
            {migration.running ? "Running..." : "Run Schema Migration"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">
            Adds any missing columns to your Supabase tables. Safe to run multiple times — uses <code className="text-xs bg-slate-100 dark:bg-zinc-800 px-1 rounded">IF NOT EXISTS</code> so existing data is never touched.
          </p>
          {!migration.done && !migration.running && (
            <p className="text-xs text-slate-400">Click the button above to check and fix your database schema.</p>
          )}
          {migration.done && (
            <div className="space-y-2">
              {migration.error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-300">
                  <strong>API Error:</strong> {migration.error}
                </div>
              )}
              {migration.results.map((r, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-lg border p-3 text-xs ${
                  r.status === "ok"
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/30 dark:bg-emerald-900/20"
                    : "border-red-200 bg-red-50 dark:border-red-800/30 dark:bg-red-900/20"
                }`}>
                  {r.status === "ok"
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className={`font-semibold ${r.status === "ok" ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300"}`}>{r.name}</p>
                    {r.error && <p className="mt-0.5 font-mono text-red-600 break-all">{r.error}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* ═══ SYNC ISSUES ═══ */}
      <Card id="sync-issues">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> Sync Issues
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${isOnline ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {isOnline ? "Online" : "Offline"}
            </span>
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={retry} disabled={syncing || pending.length === 0} className="gap-1">
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Retry all
            </Button>
            {pending.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (confirming !== "clear") { setConfirming("clear"); return; }
                  if (confirm("Clear all queued writes? They will be discarded permanently.")) {
                    clearAll();
                  }
                  setConfirming(null);
                }}
                className="gap-1 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" /> {confirming === "clear" ? "Click again to confirm" : "Clear queue"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500">No pending writes. Everything&rsquo;s synced.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((w) => (
                <li key={w.id} className="flex items-start gap-3 rounded-lg border p-3 text-xs">
                  <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${w.status === "failed-permanent" ? "text-red-600" : "text-amber-600"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {w.entity} &middot; {w.operation}
                      {w.status === "failed-permanent" && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">failed</span>}
                    </p>
                    <p className="mt-0.5 text-slate-500">Attempts: {w.attempts} &middot; Next retry: {w.status === "failed-permanent" ? "\u2014" : new Date(w.nextRetryAt).toLocaleTimeString()}</p>
                    {w.lastError && <p className="mt-1 font-mono text-red-600">{w.lastError}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeOne(w.id)} className="h-7 gap-1 text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3 w-3" /> Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
