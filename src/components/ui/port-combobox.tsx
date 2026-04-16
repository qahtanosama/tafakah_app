"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search } from "lucide-react";
import { PORTS, formatPortValue, detectCountryFromAddress } from "@/lib/ports";
import type { Port } from "@/lib/ports";

interface PortComboboxProps {
  value: string;
  onChange: (value: string) => void;
  buyerAddress?: string;
  placeholder?: string;
}

export default function PortCombobox({
  value,
  onChange,
  buyerAddress,
  placeholder = "Search ports...",
}: PortComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const detectedCountry = useMemo(
    () => (buyerAddress ? detectCountryFromAddress(buyerAddress) : null),
    [buyerAddress]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return PORTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
    );
  }, [search]);

  const { recommended, other } = useMemo(() => {
    if (!detectedCountry) return { recommended: [], other: filtered };
    const rec: Port[] = [];
    const oth: Port[] = [];
    for (const p of filtered) {
      if (p.country === detectedCountry) rec.push(p);
      else oth.push(p);
    }
    return { recommended: rec, other: oth };
  }, [filtered, detectedCountry]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(port: Port) {
    onChange(formatPortValue(port));
    setSearch("");
    setOpen(false);
  }

  // Display label for the trigger
  const displayValue = value || "";

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-1 text-left text-sm shadow-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        <span className={displayValue ? "truncate" : "text-zinc-500"}>
          {displayValue || placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-zinc-400" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {/* Search input */}
          <div className="flex items-center border-b border-zinc-100 px-3 dark:border-zinc-800">
            <Search className="mr-2 h-4 w-4 text-zinc-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to filter..."
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
            />
          </div>

          {/* Results */}
          <div className="max-h-60 overflow-y-auto p-1">
            {recommended.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-emerald-600">
                  Recommended ({detectedCountry})
                </div>
                {recommended.map((p) => (
                  <PortOption
                    key={p.code}
                    port={p}
                    selected={value === formatPortValue(p)}
                    onSelect={handleSelect}
                  />
                ))}
                {other.length > 0 && (
                  <div className="px-2 py-1.5 text-xs font-semibold text-zinc-400">
                    Other Ports
                  </div>
                )}
              </>
            )}
            {other.map((p) => (
              <PortOption
                key={p.code}
                port={p}
                selected={value === formatPortValue(p)}
                onSelect={handleSelect}
              />
            ))}
            {recommended.length === 0 && other.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-zinc-400">
                No ports found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PortOption({
  port,
  selected,
  onSelect,
}: {
  port: Port;
  selected: boolean;
  onSelect: (p: Port) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(port)}
      className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
        selected ? "bg-zinc-100 font-medium dark:bg-zinc-800" : ""
      }`}
    >
      <span className="flex-1 truncate">
        {port.name}, {port.country}
      </span>
      <span className="ml-2 shrink-0 font-mono text-xs text-zinc-400">
        {port.code}
      </span>
    </button>
  );
}
