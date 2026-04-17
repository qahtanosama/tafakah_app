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
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  useEffect(() => {
    setLog(getContractLog());
    setLoaded(true);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return log;
    const q = search.toLowerCase();
    return log.filter(
      (e) =>
        e.contractNo.toLowerCase().includes(q) ||
        e.invoiceNo.toLowerCase().includes(q) ||
        e.buyer.toLowerCase().includes(q) ||
        e.product.toLowerCase().includes(q)
    );
  }, [log, search]);

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
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by contract no, invoice no, buyer, or product..."
          className="pl-9"
        />
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
            <TableHead className="w-[150px]">Status</TableHead>
            <TableHead className="w-[140px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((entry, i) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium">{i + 1}</TableCell>
              <TableCell className="font-mono font-medium">{entry.contractNo}</TableCell>
              <TableCell className="font-mono text-sm">{entry.invoiceNo}</TableCell>
              <TableCell className="text-sm">{formatDate(entry.dateSubmitted)}</TableCell>
              <TableCell className="text-sm">{entry.buyer}</TableCell>
              <TableCell className="text-sm">{entry.product}</TableCell>
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
