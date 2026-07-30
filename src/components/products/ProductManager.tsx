"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/team-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Save, X, TrendingUp, Calculator, Package } from "lucide-react";
import type { ProductProfile, PriceHistoryEntry } from "@/types/product";
import { useProducts, useSaveProduct, useDeleteProduct } from "@/lib/data/products";
import { useContracts } from "@/lib/data/contracts";
import { priceHistoryFor, productUsageCount } from "@/lib/data/contract-analytics";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function ProductCard({ product, history, onEdit, onDelete }: {
  product: ProductProfile; history: PriceHistoryEntry[]; onEdit: (p: ProductProfile) => void; onDelete: (p: ProductProfile) => void;
}) {
  const t = useT("products");
  const tc = useT("common");
  const avgPrice = history.length > 0 ? history.reduce((s, h) => s + h.priceMT, 0) / history.length : 0;
  const lastPrice = history[0]?.priceMT ?? 0;

  return (
    <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-300 group overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 pb-4">
        <div className="flex gap-4 items-start">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 mt-1 shrink-0 group-hover:scale-105 transition-transform">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{product.name}</CardTitle>
            <div className="mt-1.5 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="bg-slate-100 dark:bg-zinc-800 text-slate-500 px-2 py-0.5 rounded border border-slate-200 dark:border-white/10">HS: {product.hsCode}</span>
              <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-500/20">Prefix: {product.prefix}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" onClick={() => onEdit(product)} title={tc("edit")} className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(product)} title={tc("delete")} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5 pb-6">
        <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-[13px] sm:text-sm">
          <div className="flex flex-col gap-1"><span className="text-slate-400 font-semibold tracking-wide uppercase text-[11px]">{t("cardNw")}</span> <span className="font-bold text-slate-700 dark:text-slate-200">{product.defaultNW} KG</span></div>
          <div className="flex flex-col gap-1"><span className="text-slate-400 font-semibold tracking-wide uppercase text-[11px]">{t("cardGw")}</span> <span className="font-bold text-slate-700 dark:text-slate-200">{product.defaultGW} KG</span></div>
          <div className="flex flex-col gap-1"><span className="text-slate-400 font-semibold tracking-wide uppercase text-[11px]">{t("cardPerContainer", { unit: packUnitWord(product.packUnit, t) })}</span> <span className="font-bold text-slate-700 dark:text-slate-200">{product.defaultCartons ? product.defaultCartons.toLocaleString() : "\u2014"}</span></div>
          <div className="flex flex-col gap-1"><span className="text-slate-400 font-semibold tracking-wide uppercase text-[11px]">{t("cardDefaultPrice")}</span> <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">${product.defaultPriceMT.toLocaleString()} <span className="text-slate-400 text-xs font-sans">/MT</span></span></div>
          <div className="flex flex-col gap-1"><span className="text-slate-400 font-semibold tracking-wide uppercase text-[11px]">{t("cardContainer")}</span> <span className="font-bold text-slate-700 dark:text-slate-200">{product.containerType}</span></div>
        </div>

        {history.length > 0 && (
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/10 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-400"><TrendingUp className="h-4 w-4" /> {t("pricingHistory")} <span className="font-normal text-emerald-600/70 text-xs">{t("shipments", { count: history.length })}</span></div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div className="bg-white dark:bg-black/20 rounded px-3 py-2 flex justify-between border border-emerald-100/50 dark:border-white/5"><span className="text-emerald-600 dark:text-emerald-500 font-medium">{t("avg")}</span> <span className="font-mono font-bold text-emerald-900 dark:text-emerald-300">${Math.round(avgPrice).toLocaleString()}</span></div>
              <div className="bg-white dark:bg-black/20 rounded px-3 py-2 flex justify-between border border-emerald-100/50 dark:border-white/5"><span className="text-emerald-600 dark:text-emerald-500 font-medium">{t("last")}</span> <span className="font-mono font-bold text-emerald-900 dark:text-emerald-300">${lastPrice.toLocaleString()}</span></div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {history.slice(0, 5).map((h, i) => (
                <span key={i} className="rounded-md bg-white dark:bg-zinc-800 border border-slate-100 dark:border-white/5 px-2 py-1 text-[11px] font-mono font-medium text-slate-600 dark:text-slate-300 shadow-sm">${h.priceMT.toLocaleString()} <span className="font-sans text-slate-400 font-normal">({fmtDate(h.date)})</span></span>
              ))}
            </div>
          </div>
        )}
        {product.notes && <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed border-l-2 border-slate-200 dark:border-zinc-700 pl-3">{product.notes}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Plural noun for a pack format. "carton" and "mesh bag" have proper words in
 * both languages; anything else the team types falls back to a naive plural,
 * which beats rendering a bare "/Cont." with no noun at all.
 */
function packUnitWord(packUnit: string, t: ReturnType<typeof useT<"products">>): string {
  if (!packUnit || packUnit === "carton") return t("unitBoxes");
  if (packUnit === "mesh bag") return t("unitMeshBags");
  return packUnit.endsWith("s") ? packUnit : packUnit + "s";
}

export default function ProductManager() {
  const t = useT("products");
  const tc = useT("common");
  const tn = useT("nav");
  const { data: productsData, isLoading, isError, error, refetch } = useProducts();
  const products = productsData ?? [];
  const saveProductMut = useSaveProduct();
  const deleteProductMut = useDeleteProduct();
  const { data: contractsData } = useContracts();

  const [histories, setHistories] = useState<Record<string, PriceHistoryEntry[]>>({});
  const [editing, setEditing] = useState<ProductProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [prefixError, setPrefixError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!productsData) return;
    const contracts = contractsData ?? [];
    const h: Record<string, PriceHistoryEntry[]> = {};
    for (const p of productsData) h[p.name] = priceHistoryFor(contracts, p.name);
    setHistories(h);
  }, [productsData, contractsData]);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }, []);

  const handleNew = useCallback(() => {
    setEditing({
      id: crypto.randomUUID(), name: "", nameAr: "", hsCode: "", prefix: "",
      defaultNW: 0, defaultGW: 0, defaultCartons: 0, packUnit: "carton", packUnitAr: "كرتون",
      defaultPriceMT: 0, containerType: "40'RH", notes: "",
    });
    setIsNew(true);
    setPrefixError("");
  }, []);

  const handleEdit = useCallback((p: ProductProfile) => {
    setEditing({ ...p });
    setIsNew(false);
    setPrefixError("");
  }, []);

  const handleDelete = useCallback((p: ProductProfile) => {
    const usage = productUsageCount(contractsData ?? [], p.name);
    const msg = usage > 0
      ? t("deleteInUse", { name: p.name, count: usage })
      : t("deleteConfirm", { name: p.name });
    if (!confirm(msg)) return;
    deleteProductMut.mutate(p.id, {
      onSuccess: () => showToast(t("deleted", { name: p.name })),
      onError: (e) => showToast(t("deleteFailed", { message: (e as Error).message })),
    });
  }, [deleteProductMut, showToast, contractsData, t]);

  const handleSave = useCallback(() => {
    if (!editing || !editing.name.trim() || !editing.prefix.trim()) return;
    // Uniqueness against the current source-of-truth list (products already loaded via useProducts,
    // so this matches whatever `products-db` is set to). Exclude the record being edited.
    const duplicate = (productsData ?? []).some(
      (p) => p.prefix.toUpperCase() === editing.prefix.toUpperCase() && p.id !== editing.id
    );
    if (duplicate) {
      setPrefixError(t("prefixTaken", { prefix: editing.prefix }));
      return;
    }
    saveProductMut.mutate({ payload: { ...editing }, isUpdate: !isNew }, {
      onSuccess: () => {
        setEditing(null);
        showToast(isNew ? t("added", { name: editing.name }) : t("updated", { name: editing.name }));
      },
      onError: (e) => showToast(t("saveFailed", { message: (e as Error).message })),
    });
  }, [editing, isNew, productsData, saveProductMut, showToast, t]);

  if (isLoading) return <div className="flex min-h-[400px] items-center justify-center py-20 text-slate-500 font-medium">{t("loadingDb")}</div>;
  if (isError) return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="mb-3 text-sm text-red-600">{t("loadFailed", { message: (error as Error).message })}</p>
      <Button onClick={() => refetch()}>{tc("retry")}</Button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-8">
      {toast && <div className="fixed top-20 right-8 z-50 rounded-xl border border-emerald-200 bg-emerald-50/90 backdrop-blur-md px-6 py-4 text-sm font-semibold text-emerald-800 shadow-xl shadow-emerald-500/10 transition-all animate-in fade-in slide-in-from-top-4">{toast}</div>}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("catalog")}</h2>
          <p className="text-slate-500 mt-1 text-sm font-medium">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Link href="/products/calculator" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full gap-2 h-11 border-slate-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-semibold shadow-sm">
              <Calculator className="h-4 w-4" /> {tn("calculator")}
            </Button>
          </Link>
          <Button className="w-full sm:w-auto gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 font-bold px-6" onClick={handleNew}>
            <Plus className="h-4 w-4" /> {t("addProduct")}
          </Button>
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <Card className="bg-white dark:bg-zinc-900 border-2 border-indigo-200 dark:border-indigo-800 shadow-xl shadow-indigo-500/5 mb-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <CardHeader className="flex flex-row items-center justify-between bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-indigo-100 dark:border-indigo-800/50 pb-4 pt-5">
            <CardTitle className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><Pencil className="h-4 w-4" /></div>
              {isNew ? t("createNew") : t("editNamed", { name: editing.name })}
            </CardTitle>
            <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors bg-white dark:bg-zinc-800 hover:bg-slate-100 rounded-full p-1.5"><X className="h-5 w-5" /></button>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 p-6">
            <div className="sm:col-span-2 lg:col-span-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fName")}</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t("fNamePlaceholder")} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fNameAr")}</Label>
              <Input dir="rtl" value={editing.nameAr} onChange={(e) => setEditing({ ...editing, nameAr: e.target.value })} placeholder="مثال: بصل طازج" className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fHsCode")}</Label>
              <Input value={editing.hsCode} onChange={(e) => setEditing({ ...editing, hsCode: e.target.value })} placeholder={t("fHsPlaceholder")} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fPrefix")}</Label>
              <Input value={editing.prefix} onChange={(e) => { setEditing({ ...editing, prefix: e.target.value.toUpperCase() }); setPrefixError(""); }} placeholder={t("fPrefixPlaceholder")} maxLength={4} className={`h-11 bg-white dark:bg-zinc-800 font-mono font-bold tracking-widest focus:ring-indigo-500/20 ${prefixError ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-slate-200 dark:border-white/10"}`} />
              {prefixError && <p className="mt-1.5 text-xs font-semibold text-red-500">{prefixError}</p>}
            </div>
            <div><Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fNw")}</Label><Input type="number" value={editing.defaultNW || ""} onChange={(e) => setEditing({ ...editing, defaultNW: parseFloat(e.target.value) || 0 })} className="h-11 bg-white dark:bg-zinc-800 font-mono focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" /></div>
            <div><Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fGw")}</Label><Input type="number" value={editing.defaultGW || ""} onChange={(e) => setEditing({ ...editing, defaultGW: parseFloat(e.target.value) || 0 })} className="h-11 bg-white dark:bg-zinc-800 font-mono focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" /></div>
            <div><Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fBoxes")}</Label><Input type="number" value={editing.defaultCartons || ""} onChange={(e) => setEditing({ ...editing, defaultCartons: parseInt(e.target.value) || 0 })} placeholder={t("fBoxesPlaceholder")} className="h-11 bg-white dark:bg-zinc-800 font-mono focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" /></div>
            <div><Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fUnit")}</Label><Input value={editing.packUnit} onChange={(e) => setEditing({ ...editing, packUnit: e.target.value })} placeholder={t("fUnitPlaceholder")} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" /></div>
            <div><Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fUnitAr")}</Label><Input value={editing.packUnitAr} onChange={(e) => setEditing({ ...editing, packUnitAr: e.target.value })} placeholder="كرتون / كيس شبكي" dir="rtl" className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" /></div>
            <div><Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fPrice")}</Label><Input type="number" value={editing.defaultPriceMT || ""} onChange={(e) => setEditing({ ...editing, defaultPriceMT: parseFloat(e.target.value) || 0 })} className="h-11 bg-white dark:bg-zinc-800 font-mono focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" /></div>
            <div><Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fContainerType")}</Label><Input value={editing.containerType} onChange={(e) => setEditing({ ...editing, containerType: e.target.value })} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" /></div>
            <div className="sm:col-span-2 lg:col-span-4"><Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">{t("fNotes")}</Label><Input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder={t("fNotesPlaceholder")} className="h-11 bg-white dark:bg-zinc-800 focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" /></div>
            <div className="sm:col-span-2 lg:col-span-4 mt-2 border-t border-slate-100 dark:border-white/5 pt-6 flex justify-end">
              <Button className="gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8" onClick={handleSave} disabled={!editing.name.trim() || !editing.prefix.trim() || !editing.hsCode.trim()}>
                <Save className="h-4 w-4" /> {isNew ? t("saveNew") : t("updateProduct")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => <ProductCard key={p.id} product={p} history={histories[p.name] ?? []} onEdit={handleEdit} onDelete={handleDelete} />)}
      </div>
    </div>
  );
}
