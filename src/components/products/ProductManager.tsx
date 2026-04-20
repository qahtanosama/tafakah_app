"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Save, X, TrendingUp, Calculator } from "lucide-react";
import type { ProductProfile, PriceHistoryEntry } from "@/types/product";
import { getProducts, addProduct, updateProduct, deleteProduct, isPrefixUsed, getProductUsageCount, getPriceHistory } from "@/lib/products";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function ProductCard({ product, history, onEdit, onDelete }: {
  product: ProductProfile; history: PriceHistoryEntry[]; onEdit: (p: ProductProfile) => void; onDelete: (p: ProductProfile) => void;
}) {
  const avgPrice = history.length > 0 ? history.reduce((s, h) => s + h.priceMT, 0) / history.length : 0;
  const lastPrice = history[0]?.priceMT ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg">{product.name}</CardTitle>
          <p className="mt-1 text-sm text-zinc-400">HS: {product.hsCode} &middot; Prefix: {product.prefix}</p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => onEdit(product)} title="Edit"><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(product)} title="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-zinc-400">N.W./Ctn:</span> <span className="font-medium">{product.defaultNW} KG</span></div>
          <div><span className="text-zinc-400">G.W./Ctn:</span> <span className="font-medium">{product.defaultGW} KG</span></div>
          <div><span className="text-zinc-400">Price/MT:</span> <span className="font-medium">${product.defaultPriceMT.toLocaleString()}</span></div>
          <div><span className="text-zinc-400">Container:</span> <span className="font-medium">{product.containerType}</span></div>
        </div>
        {history.length > 0 && (
          <div className="rounded-lg border bg-zinc-50 p-3 dark:bg-zinc-800">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><TrendingUp className="h-4 w-4 text-emerald-500" /> Pricing History ({history.length} shipments)</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-zinc-400">Avg:</span> <span className="font-medium">${Math.round(avgPrice).toLocaleString()}/MT</span></div>
              <div><span className="text-zinc-400">Last:</span> <span className="font-medium">${lastPrice.toLocaleString()}/MT</span></div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {history.slice(0, 5).map((h, i) => (
                <span key={i} className="rounded bg-white px-2 py-0.5 text-xs dark:bg-zinc-700">${h.priceMT.toLocaleString()} ({fmtDate(h.date)})</span>
              ))}
            </div>
          </div>
        )}
        {product.notes && <p className="text-sm text-zinc-500">{product.notes}</p>}
      </CardContent>
    </Card>
  );
}

export default function ProductManager() {
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [histories, setHistories] = useState<Record<string, PriceHistoryEntry[]>>({});
  const [editing, setEditing] = useState<ProductProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [prefixError, setPrefixError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const prods = getProducts();
    setProducts(prods);
    const h: Record<string, PriceHistoryEntry[]> = {};
    for (const p of prods) h[p.name] = getPriceHistory(p.name);
    setHistories(h);
    setLoaded(true);
  }, []);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }, []);

  const handleNew = useCallback(() => {
    setEditing({
      id: crypto.randomUUID(), name: "", hsCode: "", prefix: "",
      defaultNW: 0, defaultGW: 0, defaultPriceMT: 0, containerType: "1\u00d740'RH", notes: "",
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
    const usage = getProductUsageCount(p.name);
    const msg = usage > 0
      ? `"${p.name}" is used in ${usage} contract(s). It won't affect existing records but will no longer be available for new contracts. Delete?`
      : `Delete "${p.name}"?`;
    if (!confirm(msg)) return;
    deleteProduct(p.id);
    setProducts(getProducts());
    showToast(`${p.name} deleted`);
  }, [showToast]);

  const handleSave = useCallback(() => {
    if (!editing || !editing.name.trim() || !editing.prefix.trim()) return;
    if (isPrefixUsed(editing.prefix, editing.id)) {
      setPrefixError(`Prefix "${editing.prefix}" is already used. Choose another.`);
      return;
    }
    if (isNew) addProduct(editing);
    else updateProduct(editing);
    setProducts(getProducts());
    const h: Record<string, PriceHistoryEntry[]> = {};
    for (const p of getProducts()) h[p.name] = getPriceHistory(p.name);
    setHistories(h);
    setEditing(null);
    showToast(isNew ? `${editing.name} added` : `${editing.name} updated`);
  }, [editing, isNew, showToast]);

  if (!loaded) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      {toast && <div className="fixed top-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 shadow-lg">{toast}</div>}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/products/calculator"><Button variant="outline" className="gap-2"><Calculator className="h-4 w-4" /> Quote Calculator</Button></Link>
        <Button className="gap-2" onClick={handleNew}><Plus className="h-4 w-4" /> Add Product</Button>
      </div>

      {/* Editor */}
      {editing && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{isNew ? "New Product" : `Edit ${editing.name}`}</CardTitle>
            <button onClick={() => setEditing(null)} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>Product Name *</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Fresh Onion" />
            </div>
            <div>
              <Label>HS Code *</Label>
              <Input value={editing.hsCode} onChange={(e) => setEditing({ ...editing, hsCode: e.target.value })} placeholder="e.g. 070310" />
            </div>
            <div>
              <Label>Prefix (2-3 letters) *</Label>
              <Input value={editing.prefix} onChange={(e) => { setEditing({ ...editing, prefix: e.target.value.toUpperCase() }); setPrefixError(""); }} placeholder="e.g. ON" maxLength={4} className={prefixError ? "border-red-500" : ""} />
              {prefixError && <p className="mt-1 text-xs text-red-500">{prefixError}</p>}
            </div>
            <div><Label>Default N.W./Ctn (KG)</Label><Input type="number" value={editing.defaultNW || ""} onChange={(e) => setEditing({ ...editing, defaultNW: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>Default G.W./Ctn (KG)</Label><Input type="number" value={editing.defaultGW || ""} onChange={(e) => setEditing({ ...editing, defaultGW: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>Default Price/MT ($)</Label><Input type="number" value={editing.defaultPriceMT || ""} onChange={(e) => setEditing({ ...editing, defaultPriceMT: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>Container Type</Label><Input value={editing.containerType} onChange={(e) => setEditing({ ...editing, containerType: e.target.value })} /></div>
            <div className="sm:col-span-2 lg:col-span-3"><Label>Notes</Label><Input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Season, min order, etc." /></div>
            <div><Button className="gap-2" onClick={handleSave} disabled={!editing.name.trim() || !editing.prefix.trim() || !editing.hsCode.trim()}><Save className="h-4 w-4" /> {isNew ? "Add Product" : "Save"}</Button></div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {products.map((p) => <ProductCard key={p.id} product={p} history={histories[p.name] ?? []} onEdit={handleEdit} onDelete={handleDelete} />)}
      </div>
    </div>
  );
}
