"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getContractLog } from "@/lib/contract-log";
import { getWorkflow } from "@/lib/workflow";
import { STAGE_ORDER, STAGE_LABELS, type WorkflowStage } from "@/types/workflow";

export default function HomeStageWidget() {
  const [counts, setCounts] = useState<Record<WorkflowStage, number> | null>(null);

  useEffect(() => {
    function load() {
      const log = getContractLog();
      const c: Record<WorkflowStage, number> = {
        "costed": 0, "docs-generated": 0, "sent-to-factory": 0, "sc-sent-to-buyer": 0,
        "shipped": 0, "certs-ready": 0, "delivered": 0,
      };
      for (const entry of log) {
        c[getWorkflow(entry).currentStage]++;
      }
      setCounts(c);
    }
    load();
    const refresh = () => load();
    if (typeof window !== "undefined") {
      window.addEventListener("workflow-updated", refresh as EventListener);
      window.addEventListener("storage", refresh);
      return () => {
        window.removeEventListener("workflow-updated", refresh as EventListener);
        window.removeEventListener("storage", refresh);
      };
    }
  }, []);

  if (!counts) return null;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <div className="mb-8 rounded-xl border bg-white p-5 shadow-sm dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Active Contracts by Stage</h2>
        <Link href="/contract-log" className="text-xs text-zinc-400 hover:text-zinc-600">View all &rarr;</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {STAGE_ORDER.map((stage) => {
          const n = counts[stage];
          const idx = STAGE_ORDER.indexOf(stage);
          const color = stage === "delivered"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : idx >= 4
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : idx >= 2
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-zinc-50 text-zinc-600 border-zinc-200";
          const muted = n === 0 ? "opacity-50" : "";
          return (
            <Link
              key={stage}
              href={`/contract-log?stage=${encodeURIComponent(stage)}`}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:shadow-sm ${color} ${muted}`}
            >
              <span>{STAGE_LABELS[stage]}</span>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold dark:bg-zinc-800">{n}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
