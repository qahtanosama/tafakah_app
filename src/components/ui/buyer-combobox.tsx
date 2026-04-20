"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, ExternalLink } from "lucide-react";
import type { Buyer } from "@/types/buyer";

interface Props {
  buyers: Buyer[];
  onSelect: (buyer: Buyer) => void;
}

export default function BuyerCombobox({ buyers, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return buyers;
    return buyers.filter(
      (b) => b.company.toLowerCase().includes(q) || b.country.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q)
    );
  }, [buyers, search]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) setTimeout(() => inputRef.current?.focus(), 0); }}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-base shadow-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        <span className="text-zinc-500">Select from saved buyers...</span>
        <ChevronDown className="ml-2 h-4 w-4 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center border-b px-3 dark:border-zinc-800">
            <Search className="mr-2 h-4 w-4 text-zinc-400" />
            <input ref={inputRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyers..." className="h-10 w-full bg-transparent text-base outline-none placeholder:text-zinc-400" />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-zinc-400">
                No saved buyers.{" "}
                <a href="/buyers" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-600 underline">
                  Add buyers <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {filtered.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => { onSelect(b); setSearch(""); setOpen(false); }}
                className="w-full rounded px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <div className="text-sm font-medium">{b.company}{b.shortName && <span className="ml-2 text-zinc-400">({b.shortName})</span>}</div>
                <div className="text-xs text-zinc-500">{b.country}{b.email && ` \u2022 ${b.email}`}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
