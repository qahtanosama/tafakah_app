"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogOut, FileText, Loader2, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ContractRow {
  id: string;
  contract_no: string;
  invoice_no: string;
  contract_date: string | null;
  current_stage: string;
}

const STAGE_LABELS: Record<string, string> = {
  "costed": "Costed",
  "docs-generated": "Docs generated",
  "sent-to-factory": "Sent to factory",
  "sc-sent-to-buyer": "SC sent",
  "shipped": "Shipped",
  "certs-ready": "Certs ready",
  "delivered": "Delivered",
};

export default function PortalClient({ fullName, email }: { fullName: string; email: string }) {
  const [contracts, setContracts] = useState<ContractRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await createClient()
          .from("contracts")
          .select("id, contract_no, invoice_no, contract_date, current_stage")
          .order("contract_date", { ascending: false, nullsFirst: false });
        if (cancelled) return;
        if (error) setError(error.message);
        else setContracts((data ?? []) as ContractRow[]);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-slate-50 px-6 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-3xl space-y-6 rounded-2xl border bg-white p-8 shadow-sm dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
              <span className="text-lg font-bold">T</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome, {fullName}</h1>
            <p className="mt-1 text-sm text-slate-500">{email}</p>
          </div>
          <form action="/logout" method="POST">
            <Button type="submit" variant="outline" size="sm" className="gap-2">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </form>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your contracts</h2>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {!error && contracts === null && (
            <div className="flex items-center gap-2 px-2 py-6 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          )}
          {!error && contracts && contracts.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No contracts visible yet. Please contact your account manager if you expect to see one here.
            </div>
          )}
          {!error && contracts && contracts.length > 0 && (
            <ul className="divide-y divide-zinc-100 rounded-lg border bg-white dark:divide-zinc-800 dark:bg-zinc-900">
              {contracts.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/portal/contract/${c.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-zinc-400" />
                      <div>
                        <div className="font-medium text-zinc-800 dark:text-zinc-100">{c.contract_no}</div>
                        <div className="text-xs text-zinc-500">
                          Invoice {c.invoice_no}
                          {c.contract_date ? ` · ${c.contract_date}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                        {STAGE_LABELS[c.current_stage] ?? c.current_stage}
                      </span>
                      <ExternalLink className="h-3 w-3 text-zinc-400" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
