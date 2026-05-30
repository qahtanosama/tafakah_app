"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Database, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRetryQueue } from "@/components/retry-queue/RetryQueueProvider";

/**
 * Sync Issues card — surfaces the retry queue (network-blip recovery). The
 * former "Data Source" feature-flag toggles + schema-migration tooling were
 * removed in the Supabase-only rebuild (Batch 4); this is all that remains here.
 */
export default function DataSourceSection() {
  const { pending, syncing, retry, removeOne, clearAll, isOnline } = useRetryQueue();
  const [confirming, setConfirming] = useState<"clear" | null>(null);

  return (
    <div className="space-y-6">
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
                    <p className="mt-0.5 text-slate-500">Attempts: {w.attempts} &middot; Next retry: {w.status === "failed-permanent" ? "—" : new Date(w.nextRetryAt).toLocaleTimeString()}</p>
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
