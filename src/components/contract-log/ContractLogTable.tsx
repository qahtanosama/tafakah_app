"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Pencil, Eye, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ContractLogEntry, ContractStatus } from "@/types/sales-contract";
import {
  getContractLog,
  deleteContractLogEntry,
  updateContractLogEntryStatus,
} from "@/lib/contract-log";
import { saveMasterData, saveActiveContract } from "@/lib/master-data";
import { calcTotals } from "@/lib/sales-contract";
import { getAllFinance, calcSummary } from "@/lib/finance";
import { getAllShipping, getStatusInfo } from "@/lib/shipping";
import type { ShippingEntry } from "@/types/shipping";
import { getWorkflow } from "@/lib/workflow";
import { STAGE_ORDER, STAGE_LABELS, type WorkflowStage } from "@/types/workflow";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const STATUS_OPTIONS: ContractStatus[] = ["Active", "Completed", "Cancelled"];

const STATUS_COLORS: Record<ContractStatus, string> = {
  Active: "text-emerald-700 bg-emerald-50 border-emerald-200",
  Completed: "text-blue-700 bg-blue-50 border-blue-200",
  Cancelled: "text-zinc-500 bg-zinc-100 border-zinc-200",
};

function formatDate(iso: string): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ContractLogTable() {
  const [log, setLog] = useState<ContractLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | WorkflowStage>("all");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    setLog(getContractLog());
    setLoaded(true);
    const stageParam = searchParams?.get("stage");
    if (stageParam && (STAGE_ORDER as string[]).includes(stageParam)) {
      setStageFilter(stageParam as WorkflowStage);
    }
    const refresh = () => setLog(getContractLog());
    if (typeof window !== "undefined") {
      window.addEventListener("workflow-updated", refresh as EventListener);
      return () => window.removeEventListener("workflow-updated", refresh as EventListener);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    let list = log;
    if (stageFilter !== "all") {
      list = list.filter((e) => getWorkflow(e).currentStage === stageFilter);
    }
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (e) =>
        e.contractNo.toLowerCase().includes(q) ||
        e.invoiceNo.toLowerCase().includes(q) ||
        e.buyer.toLowerCase().includes(q) ||
        e.product.toLowerCase().includes(q) ||
        STAGE_LABELS[getWorkflow(e).currentStage].toLowerCase().includes(q)
    );
  }, [log, search, stageFilter]);

  const handleDelete = useCallback((id: string) => {
    deleteContractLogEntry(id);
    setLog(getContractLog());
  }, []);

  const handleStatusChange = useCallback((id: string, status: ContractStatus) => {
    updateContractLogEntryStatus(id, status);
    setLog(getContractLog());
  }, []);

  const handleEdit = useCallback(
    (entry: ContractLogEntry) => {
      saveMasterData(entry.masterSnapshot);
      router.push("/master");
    },
    [router]
  );

  const handleLoadActive = useCallback(
    (entry: ContractLogEntry) => {
      saveActiveContract({
        data: entry.masterSnapshot,
        contractNo: entry.contractNo,
        invoiceNo: entry.invoiceNo,
        dateSubmitted: entry.dateSubmitted,
      });
      router.push("/sales-contract");
    },
    [router]
  );

  const financeMap = useMemo(() => {
    const all = getAllFinance();
    const map: Record<string, ReturnType<typeof calcSummary>> = {};
    for (const e of log) {
      const t = calcTotals(e.masterSnapshot.lineItems);
      const f = all.find((fi) => fi.contractNo === e.contractNo) ?? null;
      map[e.contractNo] = calcSummary(t.totalUSD, f);
    }
    return map;
  }, [log]);

  const shippingMap = useMemo(() => {
    const all = getAllShipping();
    const map: Record<string, ShippingEntry | null> = {};
    for (const e of log) {
      map[e.contractNo] = all.find((s) => s.contractNo === e.contractNo) ?? null;
    }
    return map;
  }, [log]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        Loading...
      </div>
    );
  }

  if (log.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg font-medium text-zinc-500">No contracts submitted yet</p>
        <p className="text-sm text-zinc-400">
          Submit your first contract from the Master Data Sheet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by contract no, invoice no, buyer, product, or stage..."
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={(v) => v && setStageFilter(v as "all" | WorkflowStage)}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {STAGE_ORDER.map((s) => (
              <SelectItem key={s} value={s}>Stage: {STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 && search && (
        <p className="py-8 text-center text-sm text-zinc-400">No contracts match &ldquo;{search}&rdquo;</p>
      )}
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">No.</TableHead>
            <TableHead>Contract No.</TableHead>
            <TableHead>Invoice No.</TableHead>
            <TableHead>Date Submitted</TableHead>
            <TableHead>Buyer</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Finance</TableHead>
            <TableHead>Shipping</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="w-[150px]">Status</TableHead>
            <TableHead className="w-[140px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((entry, i) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium">{i + 1}</TableCell>
              <TableCell className="font-mono font-medium">
                <button
                  type="button"
                  onClick={() => {
                    saveActiveContract({
                      data: entry.masterSnapshot,
                      contractNo: entry.contractNo,
                      invoiceNo: entry.invoiceNo,
                      dateSubmitted: entry.dateSubmitted,
                    });
                    router.push("/documents");
                  }}
                  className="text-emerald-600 hover:underline"
                  title="Open this contract in Trade Documents"
                >
                  {entry.contractNo}
                </button>
              </TableCell>
              <TableCell className="font-mono text-sm">{entry.invoiceNo}</TableCell>
              <TableCell className="text-sm">{formatDate(entry.dateSubmitted)}</TableCell>
              <TableCell className="text-sm">{entry.buyer}</TableCell>
              <TableCell className="text-sm">{entry.product}</TableCell>
              <TableCell>
                {(() => {
                  const s = financeMap[entry.contractNo];
                  if (!s || s.totalCost === 0) return <Link href={`/finance/${encodeURIComponent(entry.contractNo)}`} className="text-xs text-zinc-400 hover:underline">Add costs</Link>;
                  const color = s.grossProfit >= 0 ? (s.paymentStatus === "paid" ? "text-emerald-600" : "text-amber-600") : "text-red-600";
                  return <Link href={`/finance/${encodeURIComponent(entry.contractNo)}`} className={`text-xs font-medium hover:underline ${color}`}>${Math.round(s.grossProfit / 1000)}k {s.paymentStatus === "paid" ? "\u2713" : s.paymentStatus === "partial" ? "\u26a0" : ""}</Link>;
                })()}
              </TableCell>
              <TableCell>
                {(() => {
                  const sh = shippingMap[entry.contractNo];
                  const info = getStatusInfo(sh);
                  return (
                    <Link
                      href={`/shipping/${encodeURIComponent(entry.contractNo)}`}
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap hover:opacity-80 ${info.badgeColor}`}
                      title={info.daysLabel}
                    >
                      {info.icon} {info.label}
                    </Link>
                  );
                })()}
              </TableCell>
              <TableCell>
                {(() => {
                  const wf = getWorkflow(entry);
                  const stageLabel = STAGE_LABELS[wf.currentStage];
                  const idx = STAGE_ORDER.indexOf(wf.currentStage);
                  const isFinal = wf.currentStage === "delivered";
                  const color = isFinal
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : idx >= 4
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : idx >= 2
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200";
                  return (
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${color}`}>
                      {idx + 1}. {stageLabel}
                    </span>
                  );
                })()}
              </TableCell>
              <TableCell>
                <Select
                  value={entry.status}
                  onValueChange={(v) => handleStatusChange(entry.id, v as ContractStatus)}
                >
                  <SelectTrigger className={`h-8 w-full border text-xs font-medium ${STATUS_COLORS[entry.status]}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleLoadActive(entry)}
                    title="View / Load as Active"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(entry)}
                    title="Edit in Master"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(entry.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
