"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { ContractLogEntry } from "@/types/sales-contract";

interface Props {
  contracts: ContractLogEntry[];
  value: string;
  onChange: (contractNo: string) => void;
}

export default function ContractCombobox({ contracts, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contracts;
    return contracts.filter(
      (c) =>
        c.contractNo.toLowerCase().includes(q) ||
        c.invoiceNo.toLowerCase().includes(q) ||
        c.buyer.toLowerCase().includes(q)
    );
  }, [contracts, search]);

  const selected = contracts.find((c) => c.contractNo === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(contractNo: string) {
    onChange(contractNo);
    setSearch("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-[320px]">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-1 text-left text-sm shadow-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        <span className={selected ? "truncate" : "text-zinc-500"}>
          {selected ? `${selected.contractNo} \u2014 ${selected.buyer}` : "Select contract..."}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center border-b border-zinc-100 px-3 dark:border-zinc-800">
            <Search className="mr-2 h-4 w-4 text-zinc-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by contract, invoice, or buyer..."
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-zinc-400">No contracts found</div>
            )}
            {filtered.map((c) => (
              <button
                key={c.contractNo}
                type="button"
                onClick={() => handleSelect(c.contractNo)}
                className={`w-full rounded px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  c.contractNo === value ? "bg-zinc-100 dark:bg-zinc-800" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{c.contractNo}</span>
                  <span className="font-mono text-xs text-zinc-400">{c.invoiceNo}</span>
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {c.buyer} &mdash; <span className={
                    c.status === "Active" ? "text-emerald-600" :
                    c.status === "Completed" ? "text-blue-600" : "text-zinc-400"
                  }>{c.status}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
