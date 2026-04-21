"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, MessageCircle, Factory, MapPin, MessageSquare } from "lucide-react";
import type { Seller } from "@/types/seller";
import type { ProductProfile } from "@/types/product";
import { getSellers, saveSeller, deleteSeller, createEmptySeller } from "@/lib/sellers";
import { getProducts } from "@/lib/products";
import SellerEditForm from "./SellerEditForm";

const COUNTRY_FLAGS: Record<string, string> = {
  China: "\ud83c\udde8\ud83c\uddf3",
  Kenya: "\ud83c\uddf0\ud83c\uddea",
  Vietnam: "\ud83c\uddfb\ud83c\uddf3",
  Thailand: "\ud83c\uddf9\ud83c\udded",
  India: "\ud83c\uddee\ud83c\uddf3",
  Pakistan: "\ud83c\uddf5\ud83c\uddf0",
  Turkey: "\ud83c\uddf9\ud83c\uddf7",
  Egypt: "\ud83c\uddea\ud83c\uddec",
  Peru: "\ud83c\uddf5\ud83c\uddea",
  Chile: "\ud83c\udde8\ud83c\uddf1",
  "South Africa": "\ud83c\uddff\ud83c\udde6",
  Indonesia: "\ud83c\uddee\ud83c\udde9",
  Philippines: "\ud83c\uddf5\ud83c\udded",
};

type CountryFilter = "all" | "China" | "Kenya" | "Other";

export default function SellerManager() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState<CountryFilter>("all");
  const [editing, setEditing] = useState<Seller | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const all = getSellers();
    setSellers(all);
    setProducts(getProducts());
    setLoaded(true);

    const editId = searchParams?.get("edit");
    const newPreselect = searchParams?.get("new");
    if (editId) {
      const target = all.find((s) => s.id === editId);
      if (target) setEditing({ ...target });
    } else if (newPreselect) {
      const empty = createEmptySeller();
      if (newPreselect) empty.products = [newPreselect];
      setEditing(empty);
    }
  }, [searchParams]);

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
    saveSeller(seller);
    setSellers(getSellers());
    setEditing(null);
    showToast("Seller saved");
  }, [showToast]);

  const handleDelete = useCallback((id: string) => {
    deleteSeller(id);
    setSellers(getSellers());
    setEditing(null);
    showToast("Seller deleted");
  }, [showToast]);

  if (!loaded) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {toast}
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Sellers / Factories</h1>
        <Button className="gap-2" onClick={() => setEditing(createEmptySeller())}>
          <Plus className="h-4 w-4" /> Add Seller
        </Button>
      </div>

      {/* Search + filter chips */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company, contact, or country..." className="pl-9" />
        </div>
        <div className="flex gap-1 rounded-md border bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
          {(["all", "China", "Kenya", "Other"] as CountryFilter[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCountryFilter(c)}
              className={`rounded px-3 py-1 ${countryFilter === c ? "bg-white font-medium shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid or empty state */}
      {sellers.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <Factory className="h-10 w-10 text-zinc-300" />
          <p className="text-lg font-medium text-zinc-500">No sellers yet.</p>
          <p className="text-sm text-zinc-400">Add your first factory.</p>
          <Button className="gap-2" onClick={() => setEditing(createEmptySeller())}>
            <Plus className="h-4 w-4" /> Add Seller
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-400">No sellers match the current filter.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setEditing({ ...s })}
              className="group flex flex-col gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.companyName || "(unnamed)"}</p>
                  {s.companyNameCn && <p className="truncate text-xs text-zinc-400" dir="auto">{s.companyNameCn}</p>}
                </div>
                <span className="text-lg leading-none">{COUNTRY_FLAGS[s.country] ?? "\ud83c\udf10"}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3 w-3" /> {s.country}{s.city ? ` \u00b7 ${s.city}` : ""}
              </div>
              <div className="text-sm">
                <span className="font-medium">{s.contactName || "(no contact)"}</span>
                {s.contactTitle && <span className="text-zinc-400"> \u00b7 {s.contactTitle}</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                {s.products.length === 0 ? (
                  <span className="text-xs text-zinc-300">No products assigned</span>
                ) : (
                  s.products.slice(0, 6).map((pid) => {
                    const p = productMap[pid];
                    return (
                      <span key={pid} className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                        {p?.name ?? pid}
                      </span>
                    );
                  })
                )}
                {s.products.length > 6 && <span className="text-xs text-zinc-400">+{s.products.length - 6} more</span>}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                {s.whatsappNumber ? (
                  <span className="flex items-center gap-1 text-[#25D366]">
                    <MessageCircle className="h-3 w-3" /> {s.whatsappNumber}
                  </span>
                ) : (
                  <span>No WhatsApp</span>
                )}
                {s.wechatId && (
                  <span className="flex items-center gap-1 truncate" style={{ color: "#07C160" }} title={s.wechatId}>
                    <MessageSquare className="h-3 w-3" /> {s.wechatId}
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
