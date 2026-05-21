"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FileX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActiveContract } from "@/types/sales-contract";
import { calcTotals } from "@/lib/sales-contract";
import { loadActiveContract } from "@/lib/master-data";
import {
  getContractContainers,
  getContractIdByNo,
} from "@/lib/contracts/update-shipping";

const PackingListPDFDownload = dynamic(
  () => import("./PackingListPDFDownload"),
  { ssr: false }
);

function formatDateTime(iso: string): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function PackingListForm() {
  const [active, setActive] = useState<ActiveContract | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadActiveContract();
      if (!local) {
        if (!cancelled) {
          setActive(null);
          setLoaded(true);
        }
        return;
      }
      try {
        const idRes = await getContractIdByNo({ contractNo: local.contractNo });
        if (idRes.ok) {
          const data = await getContractContainers({ contractId: idRes.contractId });
          if (data.ok) {
            local.data = {
              ...local.data,
              blNumber: data.blNumber,
              containers: data.containers.map((number) => ({ number })),
            };
          }
        }
      } catch {
        // best-effort
      }
      if (!cancelled) {
        setActive(local);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = active?.data ?? null;
  const totals = useMemo(() => (data ? calcTotals(data.lineItems, data.terms?.numberOfContainers) : null), [data]);

  if (!loaded) {
    return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;
  }

  if (!active || !data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-20 text-center">
        <FileX className="h-12 w-12 text-zinc-400" />
        <h2 className="text-xl font-bold">No Contract Submitted Yet</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Fill in the Master Data Sheet and click &ldquo;Submit Contract&rdquo; to generate a Packing List.
        </p>
        <Link href="/master"><Button size="lg">Go to Master Data</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-4 dark:border-emerald-800 dark:bg-emerald-950">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Showing <span className="font-bold">Packing List</span> for contract{" "}
          <span className="font-bold">{active.contractNo}</span> &mdash; submitted {formatDateTime(active.dateSubmitted)}
        </p>
      </div>
      <div className="flex flex-col items-center gap-4 pb-12">
        <PackingListPDFDownload
          data={data}
          totals={totals!}
          contractNumber={active.contractNo}
          invoiceNumber={active.invoiceNo}
        />
        <Link href="/master" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          Edit Master Data
        </Link>
      </div>
    </div>
  );
}
