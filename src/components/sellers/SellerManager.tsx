"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, MessageCircle, Factory, MapPin, MessageSquare } from "lucide-react";
import type { Seller } from "@/types/seller";
import type { ProductProfile } from "@/types/product";
import { createEmptySeller } from "@/lib/sellers";
import { useSellers, useSaveSeller, useDeleteSeller } from "@/lib/data/sellers";
import { useProducts } from "@/lib/data/products";
import SellerEditForm from "./SellerEditForm";

const COUNTRY_FLAGS: Record<string, string> = {
  China: "🇨🇳",
  Kenya: "🇰🇪",
  Vietnam: "🇻🇳",
  Thailand: "🇹🇭",
  India: "🇮🇳",
  Pakistan: "🇵🇰",
  Turkey: "🇹🇷",
  Egypt: "🇪🇬",
  Peru: "🇵🇪",
  Chile: "🇨🇱",
  "South Africa": "🇿🇦",
  Indonesia: "🇮🇩",
  Philippines: "🇵🇭",
};

type CountryFilter = "all" | "China" | "Kenya" | "Other";

export default function SellerManager() {
  const { data: sellersData, isLoading, isError, error, refetch } = useSellers();
  const sellers = sellersData ?? [];
  const saveSellerMut = useSaveSeller();
  const deleteSellerMut = useDeleteSeller();
  const { data: productsData } = useProducts();
  const products = useMemo<ProductProfile[]>(() => productsData ?? [], [productsData]);

  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState<CountryFilter>("all");
  const [editing, setEditing] = useState<Seller | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!sellersData) return;
    const editId = searchParams?.get("edit");
    const newPreselect = searchParams?.get("new");
    if (editId) {
      const target = sellersData.find((s) => s.id === editId);
      if (target) setEditing({ ...target });
    } else if (newPreselect) {
      const empty = createEmptySeller();
      empty.products = [newPreselect];
      setEditing(empty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, !!sellersData]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const productMap = useMemo(() => {
    const m: Record<string, ProductProfile> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const filtered = useMemo(() => {
    let list = sellers;
    if (countryFilter !== "all") {
      if (countryFilter === "Other") {
        list = list.filter((s) => s.country !== "China" && s.country !== "Kenya");
      } else {
        list = list.filter((s) => s.country === countryFilter);
      }
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        s.companyName.toLowerCase().includes(q) ||
        (s.companyNameCn ?? "").toLowerCase().includes(q) ||
        s.contactName.toLowerCase().includes(q) ||
        s.country.toLowerCase().includes(q)
      );
    }
    return list;
  }, [sellers, search, countryFilter]);

  const handleSave = useCallback((seller: Seller) => {
    saveSellerMut.mutate(seller, {
      onSuccess: () => { setEditing(null); showToast("Seller saved"); },
      onError: (e) => showToast(`Save failed: ${(e as Error).message}`),
    });
  }, [saveSellerMut, showToast]);

  const handleDelete = useCallback((id: string) => {
    deleteSellerMut.mutate(id, {
      onSuccess: () => { setEditing(null); showToast("Seller deleted"); },
      onError: (e) => showToast(`Delete failed: ${(e as Error).message}`),
    });
  }, [deleteSellerMut, showToast]);

  if (isLoading) return <div className="flex items-center justify-center py-20 text-slate-500 font-medium">Loading database&hellip;</div>;
  if (isError) return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="mb-3 text-sm text-red-600">Failed to load sellers: {(error as Error).message}</p>
      <Button onClick={() => refetch()}>Retry</Button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-8">
      {toast && (
        <div className="fixed top-20 right-8 z-50 rounded-xl border border-emerald-200 bg-emerald-50/90 backdrop-blur-md px-6 py-4 text-sm font-semibold text-emerald-800 shadow-xl shadow-emerald-500/10 transition-all animate-in fade-in slide-in-from-top-4">
          {toast}
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Sellers / Factories</h2>
          <p className="text-slate-500 mt-1 text-sm font-medium">Manage your suppliers, their locations, and offered products.</p>
        </div>
        <Button className="gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 font-bold px-6" onClick={() => setEditing(createEmptySeller())}>
          <Plus className="h-4 w-4" /> Add Factory
        </Button>
      </div>

      {/* Search + filter chips */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company, contact, or country..." className="pl-9 h-11 bg-white/50 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800 focus:ring-indigo-500/20 shadow-sm transition-all" />
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm font-semibold dark:border-white/10 dark:bg-zinc-900 shadow-sm">
          {(["all", "China", "Kenya", "Other"] as CountryFilter[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCountryFilter(c)}
              className={`rounded-md px-4 py-1.5 transition-all ${countryFilter === c ? "bg-slate-100 text-indigo-700 shadow-sm dark:bg-zinc-800 dark:text-indigo-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid or empty state */}
      {sellers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 bg-white/30 dark:bg-zinc-900/30">
          <div className="h-16 w-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-500 mb-6 shadow-sm"><Factory className="h-8 w-8" /></div>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">No factories yet.</p>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 max-w-sm">Build your supplier database to keep track of sourcing locations and product offerings.</p>
          <Button className="gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 font-bold px-8" onClick={() => setEditing(createEmptySeller())}>
            <Plus className="h-4 w-4" /> Add Factory
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm font-semibold text-slate-500">No sellers match the current filter.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setEditing({ ...s })}
              className="group flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-white/80 p-5 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-white/10 dark:bg-zinc-900/80 dark:hover:border-indigo-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{s.companyName || "(unnamed)"}</p>
                  {s.companyNameCn && <p className="truncate text-sm font-medium text-slate-400 dark:text-slate-500 mt-0.5" dir="auto">{s.companyNameCn}</p>}
                </div>
                <span className="text-2xl leading-none opacity-80">{COUNTRY_FLAGS[s.country] ?? "🌍"}</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                  <MapPin className="h-4 w-4 text-slate-400" /> {s.country}{s.city ? ` · ${s.city}` : ""}
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800 text-xs font-bold text-slate-500">
                    {s.contactName ? s.contactName.charAt(0).toUpperCase() : "?"}
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{s.contactName || "(no contact)"}</span>
                  {s.contactTitle && <span className="text-slate-400">· {s.contactTitle}</span>}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {s.products.length === 0 ? (
                  <span className="text-xs font-medium text-slate-400 bg-slate-50 dark:bg-zinc-800 px-2 py-1 rounded-md border border-slate-100 dark:border-white/5">No products assigned</span>
                ) : (
                  s.products.slice(0, 5).map((pid) => {
                    const p = productMap[pid];
                    return (
                      <span key={pid} className="rounded-md bg-indigo-50 border border-indigo-100/50 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800/50 dark:text-indigo-300">
                        {p?.name ?? pid}
                      </span>
                    );
                  })
                )}
                {s.products.length > 5 && <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-zinc-800 px-2 py-1 rounded-md">+{s.products.length - 5} more</span>}
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {s.whatsappNumber ? (
                  <span className="flex items-center gap-1.5 text-[#25D366]">
                    <MessageCircle className="h-4 w-4" /> {s.whatsappNumber}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4 opacity-40" /> No WhatsApp</span>
                )}
                {s.wechatId && (
                  <span className="flex items-center gap-1.5 truncate text-[#07C160]" title={s.wechatId}>
                    <MessageSquare className="h-4 w-4" /> {s.wechatId}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <SellerEditForm
          open={!!editing}
          initial={editing}
          existingIds={sellers.map((s) => s.id)}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
