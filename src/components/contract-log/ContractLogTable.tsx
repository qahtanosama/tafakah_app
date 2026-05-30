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
import type { ContractStatus, SalesContractData } from "@/types/sales-contract";
import { useContracts, useDeleteContract, useSetContractStatus, type ContractRow } from "@/lib/data/contracts";
import { getContractLog, deleteContractLogEntry, updateContractLogEntryStatus } from "@/lib/contract-log";
import { saveMasterData, saveActiveContract } from "@/lib/master-data";
import { calcTotals } from "@/lib/sales-contract";
import { getAllFinance, calcSummary } from "@/lib/finance";
import { getAllShipping, getStatusInfo } from "@/lib/shipping";
import type { ShippingEntry } from "@/types/shipping";
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
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Derive a display buyer name from the frozen snapshot. */
function buyerName(row: ContractRow): string {
  return row.master_snapshot?.buyer?.company?.trim() || "—";
}

function productName(row: ContractRow): string {
  return row.product_label || row.master_snapshot?.lineItems?.[0]?.product || "—";
}

/** Remove the transitional localStorage mirror entry for a contract, by contract_no. */
function deleteLocalMirror(contractNo: string) {
  try {
    const local = getContractLog().find((e) => e.contractNo === contractNo);
    if (local) deleteContractLogEntry(local.id);
  } catch {
    /* ignore */
  }
}

function setLocalStatusMirror(contractNo: string, status: ContractStatus) {
  try {
    const local = getContractLog().find((e) => e.contractNo === contractNo);
    if (local) updateContractLogEntryStatus(local.id, status);
  } catch {
    /* ignore */
  }
}

export default function ContractLogTable() {
  const { data: contractsData, isLoading } = useContracts();
  const contracts = useMemo(() => contractsData ?? [], [contractsData]);
  const deleteContract = useDeleteContract();
  const setStatus = useSetContractStatus();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | WorkflowStage>("all");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const stageParam = searchParams?.get("stage");
    if (stageParam && (STAGE_ORDER as string[]).includes(stageParam)) {
      setStageFilter(stageParam as WorkflowStage);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    let list = contracts;
    if (stageFilter !== "all") {
      list = list.filter((c) => c.current_stage === stageFilter);
    }
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (c) =>
        c.contract_no.toLowerCase().includes(q) ||
        c.invoice_no.toLowerCase().includes(q) ||
        buyerName(c).toLowerCase().includes(q) ||
        productName(c).toLowerCase().includes(q) ||
        (STAGE_LABELS[c.current_stage as WorkflowStage] ?? "").toLowerCase().includes(q)
    );
  }, [contracts, search, stageFilter]);

  const handleDelete = useCallback(
    (row: ContractRow) => {
      // Hard delete in Supabase (cascades finance/shipping/documents) + clear the
      // transitional localStorage mirror so the not-yet-migrated pages stay in sync.
      deleteContract.mutate({ id: row.id, hard: true });
      deleteLocalMirror(row.contract_no);
    },
    [deleteContract]
  );

  const handleStatusChange = useCallback(
    (row: ContractRow, status: ContractStatus) => {
      setStatus.mutate({ id: row.id, status });
      setLocalStatusMirror(row.contract_no, status);
    },
    [setStatus]
  );

  /** Reconstruct the ActiveContract handoff (localStorage) from the snapshot, for the PDF generators. */
  const toActive = useCallback((row: ContractRow): { data: SalesContractData; contractNo: string; invoiceNo: string; dateSubmitted: string } | null => {
    if (!row.master_snapshot) return null;
    return {
      data: row.master_snapshot,
      contractNo: row.contract_no,
      invoiceNo: row.invoice_no,
      dateSubmitted: row.created_at,
    };
  }, []);

  const handleEdit = useCallback(
    (row: ContractRow) => {
      if (!row.master_snapshot) return;
      saveMasterData(row.master_snapshot);
      router.push("/master");
    },
    [router]
  );

  const handleLoadActive = useCallback(
    (row: ContractRow) => {
      const active = toActive(row);
      if (!active) return;
      saveActiveContract(active);
      router.push("/sales-contract");
    },
    [router, toActive]
  );

  // Finance + shipping summaries still come from localStorage (deferred domains),
  // keyed by contract_no. Transitional until Steps 5–6 migrate them to Supabase.
  const financeMap = useMemo(() => {
    const all = getAllFinance();
    const map: Record<string, ReturnType<typeof calcSummary>> = {};
    for (const c of contracts) {
      const snap = c.master_snapshot;
      const t = snap ? calcTotals(snap.lineItems, snap.terms?.numberOfContainers) : { totalUSD: 0 } as ReturnType<typeof calcTotals>;
      const f = all.find((fi) => fi.contractNo === c.contract_no) ?? null;
      map[c.contract_no] = calcSummary(t.totalUSD, f);
    }
    return map;
  }, [contracts]);

  const shippingMap = useMemo(() => {
    const all = getAllShipping();
    const map: Record<string, ShippingEntry | null> = {};
    for (const c of contracts) {
      map[c.contract_no] = all.find((s) => s.contractNo === c.contract_no) ?? null;
    }
    return map;
  }, [contracts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        Loading...
      </div>
    );
  }

  if (contracts.length === 0) {
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
          {filtered.map((row, i) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{i + 1}</TableCell>
              <TableCell className="font-mono font-medium">
                <button
                  type="button"
                  onClick={() => {
                    const active = toActive(row);
                    if (!active) return;
                    saveActiveContract(active);
                    router.push("/documents");
                  }}
                  className="text-emerald-600 hover:underline"
                  title="Open this contract in Trade Documents"
                >
                  {row.contract_no}
                </button>
              </TableCell>
              <TableCell className="font-mono text-sm">{row.invoice_no}</TableCell>
              <TableCell className="text-sm">{formatDate(row.created_at)}</TableCell>
              <TableCell className="text-sm">{buyerName(row)}</TableCell>
              <TableCell className="text-sm">{productName(row)}</TableCell>
              <TableCell>
                {(() => {
                  const s = financeMap[row.contract_no];
                  if (!s || s.totalCost === 0) return <Link href={`/finance/${encodeURIComponent(row.contract_no)}`} className="text-xs text-zinc-400 hover:underline">Add costs</Link>;
                  const color = s.grossProfit >= 0 ? (s.paymentStatus === "paid" ? "text-emerald-600" : "text-amber-600") : "text-red-600";
                  return <Link href={`/finance/${encodeURIComponent(row.contract_no)}`} className={`text-xs font-medium hover:underline ${color}`}>${Math.round(s.grossProfit / 1000)}k {s.paymentStatus === "paid" ? "✓" : s.paymentStatus === "partial" ? "⚠" : ""}</Link>;
                })()}
              </TableCell>
              <TableCell>
                {(() => {
                  const sh = shippingMap[row.contract_no];
                  const info = getStatusInfo(sh);
                  return (
                    <Link
                      href={`/shipping/${encodeURIComponent(row.contract_no)}`}
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
                  const stage = row.current_stage as WorkflowStage;
                  const stageLabel = STAGE_LABELS[stage] ?? stage;
                  const idx = STAGE_ORDER.indexOf(stage);
                  const isFinal = stage === "delivered";
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
                  value={row.status}
                  onValueChange={(v) => handleStatusChange(row, v as ContractStatus)}
                >
                  <SelectTrigger className={`h-8 w-full border text-xs font-medium ${STATUS_COLORS[row.status]}`}>
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
                    onClick={() => handleLoadActive(row)}
                    title="View / Load as Active"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(row)}
                    title="Edit in Master"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(row)}
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
