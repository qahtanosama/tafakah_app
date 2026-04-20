"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Copy, Save, Check, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import type { ProductProfile } from "@/types/product";
import { getProducts, getPriceHistory } from "@/lib/products";

/* ── Types ─────────────────────────────────────── */
type Currency = "USD" | "RMB" | "EUR" | "SAR" | "AED" | "KWD";
type CostUnit = "per_kg" | "per_mt" | "per_carton" | "per_container" | "flat";

interface CostLine {
  id: string;
  label: string;
  description: string;
  amount: number;
  currency: Currency;
  unit: CostUnit;
  isPredefined: boolean;
}

interface FxRates { RMB: number; EUR: number; SAR: number; AED: number; KWD: number; }

const DEFAULT_FX: FxRates = { RMB: 7.24, EUR: 0.92, SAR: 3.75, AED: 3.67, KWD: 0.31 };
const CURRENCIES: Currency[] = ["USD", "RMB", "EUR", "SAR", "AED", "KWD"];
const CURRENCY_LABELS: Record<Currency, string> = { USD: "USD", RMB: "RMB", EUR: "EUR", SAR: "SAR", AED: "AED", KWD: "KWD" };

const MAIN_UNITS: Record<string, { options: { value: CostUnit; label: string }[] }> = {
  supplier: { options: [{ value: "per_kg", label: "Per KG" }, { value: "per_mt", label: "Per MT" }, { value: "per_carton", label: "Per Carton" }] },
  packing: { options: [{ value: "per_carton", label: "Per Carton" }, { value: "flat", label: "Flat Rate" }] },
  freight: { options: [{ value: "per_container", label: "Per Container" }, { value: "per_mt", label: "Per MT" }] },
};

const STORAGE_KEY = "calculator.defaults";

function defaultMainCosts(): CostLine[] {
  return [
    { id: "supplier", label: "Supplier Cost (EXW)", description: "", amount: 0, currency: "RMB", unit: "per_kg", isPredefined: true },
    { id: "packing", label: "Packing Materials", description: "", amount: 0, currency: "USD", unit: "flat", isPredefined: true },
    { id: "freight", label: "Sea Freight", description: "", amount: 0, currency: "RMB", unit: "per_container", isPredefined: true },
  ];
}

function defaultAddOns(): CostLine[] {
  return [
    { id: "exp", label: "Export Fee (EXP)", description: "", amount: 450, currency: "USD", unit: "flat", isPredefined: true },
    { id: "customs", label: "Customs & Port", description: "", amount: 680, currency: "USD", unit: "flat", isPredefined: true },
    { id: "insurance", label: "Insurance", description: "", amount: 150, currency: "USD", unit: "flat", isPredefined: true },
    { id: "inspection", label: "Inspection / Phyto", description: "", amount: 220, currency: "USD", unit: "flat", isPredefined: true },
    { id: "trucking", label: "Trucking / Inland", description: "", amount: 500, currency: "USD", unit: "flat", isPredefined: true },
    { id: "bank", label: "Bank Charges", description: "", amount: 80, currency: "USD", unit: "flat", isPredefined: true },
  ];
}

function fmtUSD(n: number) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtUSD0(n: number) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

function toUSD(amount: number, cur: Currency, fx: FxRates): number {
  if (cur === "USD") return amount;
  if (cur === "RMB") return amount / fx.RMB;
  if (cur === "EUR") return amount / fx.EUR;
  if (cur === "SAR") return amount / fx.SAR;
  if (cur === "AED") return amount / fx.AED;
  if (cur === "KWD") return amount / fx.KWD;
  return amount;
}

/* ── Cost Row Component ────────────────────────── */
function CostRowInput({ line, unitOptions, onChange, onDelete, usdEquiv }: {
  line: CostLine;
  unitOptions: { value: CostUnit; label: string }[];
  onChange: (updated: CostLine) => void;
  onDelete?: () => void;
  usdEquiv: number;
}) {
  return (
    <tr className="border-b border-zinc-100">
      <td className="py-1.5 pr-2 text-sm">
        {line.isPredefined ? (
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{line.label}</span>
        ) : (
          <input value={line.label} onChange={(e) => onChange({ ...line, label: e.target.value })} className="w-full bg-transparent text-sm font-medium outline-none" placeholder="Category" />
        )}
      </td>
      <td className="w-[90px] px-1 py-1">
        <input type="number" step="0.01" value={line.amount || ""} onChange={(e) => onChange({ ...line, amount: parseFloat(e.target.value) || 0 })}
          className="h-8 w-full rounded border border-zinc-200 bg-transparent px-2 text-right font-mono text-sm outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200" placeholder="\u2014" />
      </td>
      <td className="w-[80px] px-1 py-1">
        <select value={line.currency} onChange={(e) => onChange({ ...line, currency: e.target.value as Currency })}
          className="h-8 w-full rounded border border-zinc-200 bg-transparent px-1 text-sm outline-none focus:border-blue-300">
          {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>)}
        </select>
      </td>
      <td className="w-[110px] px-1 py-1">
        <select value={line.unit} onChange={(e) => onChange({ ...line, unit: e.target.value as CostUnit })}
          className="h-8 w-full rounded border border-zinc-200 bg-transparent px-1 text-sm outline-none focus:border-blue-300">
          {unitOptions.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </td>
      <td className="w-[100px] px-2 py-1 text-right font-mono text-sm text-zinc-500">
        {line.amount > 0 ? fmtUSD(usdEquiv) : "\u2014"}
      </td>
      <td className="w-[30px] px-1 py-1">
        {onDelete && <button onClick={onDelete} className="text-zinc-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>}
      </td>
    </tr>
  );
}

/* ── Main Calculator ───────────────────────────── */
export default function QuoteCalculator() {
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [cartons, setCartons] = useState(9700);
  const [containerType, setContainerType] = useState("1\u00d740'RH");
  const [mainCosts, setMainCosts] = useState<CostLine[]>(defaultMainCosts());
  const [addOns, setAddOns] = useState<CostLine[]>(defaultAddOns());
  const [customItems, setCustomItems] = useState<CostLine[]>([]);
  const [fx, setFx] = useState<FxRates>(DEFAULT_FX);
  const [showFx, setShowFx] = useState(false);
  const [margin, setMargin] = useState(20);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load saved defaults
  useEffect(() => {
    const prods = getProducts();
    setProducts(prods);
    if (prods.length > 0) setSelectedId(prods[0].id);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.mainCosts) setMainCosts(saved.mainCosts);
        if (saved.addOns) setAddOns(saved.addOns);
        if (saved.customItems) setCustomItems(saved.customItems);
        if (saved.fxRates) setFx(saved.fxRates);
        if (saved.targetMargin) setMargin(saved.targetMargin);
      }
    } catch { /* ignore */ }
  }, []);

  // Auto-save settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mainCosts, addOns, customItems, fxRates: fx, targetMargin: margin }));
    } catch { /* ignore */ }
  }, [mainCosts, addOns, customItems, fx, margin]);

  const product = useMemo(() => products.find((p) => p.id === selectedId), [products, selectedId]);
  useEffect(() => { if (product) setContainerType(product.containerType); }, [product]);

  const nw = product?.defaultNW ?? 0;
  const gw = product?.defaultGW ?? 0;
  const totalNW = nw * cartons;
  const qtyMTS = totalNW / 1000;

  // Calculate USD equivalent for a cost line
  const calcLineUSD = useCallback((line: CostLine): number => {
    const amtUSD = toUSD(line.amount, line.currency, fx);
    switch (line.unit) {
      case "per_kg": return amtUSD * totalNW;
      case "per_mt": return amtUSD * qtyMTS;
      case "per_carton": return amtUSD * cartons;
      case "per_container": return amtUSD;
      case "flat": return amtUSD;
      default: return amtUSD;
    }
  }, [fx, totalNW, qtyMTS, cartons]);

  const mainCostsUSD = useMemo(() => mainCosts.map(calcLineUSD), [mainCosts, calcLineUSD]);
  const addOnsUSD = useMemo(() => addOns.map(calcLineUSD), [addOns, calcLineUSD]);
  const customUSD = useMemo(() => customItems.map(calcLineUSD), [customItems, calcLineUSD]);

  const totalMainUSD = mainCostsUSD.reduce((s, v) => s + v, 0);
  const totalAddOnUSD = addOnsUSD.reduce((s, v) => s + v, 0) + customUSD.reduce((s, v) => s + v, 0);
  const landedCost = totalMainUSD + totalAddOnUSD;
  const costPerMT = qtyMTS > 0 ? landedCost / qtyMTS : 0;
  const costPerCarton = cartons > 0 ? landedCost / cartons : 0;

  const sellPerMT = margin < 100 ? costPerMT / (1 - margin / 100) : 0;
  const sellPerCarton = cartons > 0 ? (sellPerMT * qtyMTS) / cartons : 0;
  const sellTotal = sellPerMT * qtyMTS;
  const profit = sellTotal - landedCost;

  const scenarios = [10, 15, 20, 25, 30].map((m) => {
    const spm = m < 100 ? costPerMT / (1 - m / 100) : 0;
    return { margin: m, priceMT: spm, priceCarton: cartons > 0 ? (spm * qtyMTS) / cartons : 0, total: spm * qtyMTS };
  });

  const priceComparisons = useMemo(() => {
    if (!product) return [];
    const history = getPriceHistory(product.name);
    const byBuyer: Record<string, { priceMT: number; date: string }> = {};
    for (const h of history) { if (!byBuyer[h.buyer]) byBuyer[h.buyer] = { priceMT: h.priceMT, date: h.date }; }
    return Object.entries(byBuyer).slice(0, 5).map(([buyer, d]) => ({
      buyer, priceMT: d.priceMT, date: d.date, diff: sellPerMT > 0 ? ((sellPerMT - d.priceMT) / d.priceMT) * 100 : 0,
    }));
  }, [product, sellPerMT]);

  const handleCopy = useCallback(() => {
    if (!product) return;
    const text = `Quote: ${product.name}\nSize: ${nw}KG / Carton\nContainer: ${containerType} (${cartons.toLocaleString()} cartons)\nQuantity: ${qtyMTS.toFixed(2)} MTS\nPrice: ${fmtUSD0(sellPerMT)} per MT (negotiable)\nTotal: ${fmtUSD0(sellTotal)} USD\nValid for 7 days\n\n\u2014 TAFAKAH Food (Shanghai) Co., Ltd.`;
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [product, nw, containerType, cartons, qtyMTS, sellPerMT, sellTotal]);

  const handleSaveDraft = useCallback(() => {
    if (!product) return;
    localStorage.setItem("master-draft", JSON.stringify({ product: product.name, nwPerCarton: nw, gwPerCarton: gw, cartons, pricePerMT: Math.round(sellPerMT * 100) / 100, containerType }));
    setToast("Draft saved. Open Master Data to continue."); setTimeout(() => setToast(null), 3000);
  }, [product, nw, gw, cartons, sellPerMT, containerType]);

  const addCustomItem = useCallback(() => {
    setCustomItems((prev) => [...prev, { id: `c-${crypto.randomUUID().slice(0, 8)}`, label: "", description: "", amount: 0, currency: "USD", unit: "flat", isPredefined: false }]);
  }, []);

  const FLAT_UNITS = [{ value: "flat" as CostUnit, label: "Flat Rate" }];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      {toast && <div className="fixed top-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 shadow-lg">{toast}</div>}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ═══ LEFT: INPUTS ═══ */}
        <div className="space-y-6">
          {/* Product + Container row */}
          <Card>
            <CardHeader><CardTitle>Product & Container</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Product</Label>
                <Select value={selectedId} onValueChange={(v) => v && setSelectedId(v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Container</Label>
                <Select value={containerType} onValueChange={(v) => v && setContainerType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["1\u00d720'GP", "1\u00d740'GP", "1\u00d740'HC", "1\u00d740'RH", "1\u00d745'HC"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Cartons</Label><Input type="number" value={cartons} onChange={(e) => setCartons(parseInt(e.target.value) || 0)} /></div>
              <div className="flex items-end gap-4 text-sm text-zinc-500">
                <span>N.W.: {totalNW.toLocaleString()} KG</span>
                <span>Qty: {qtyMTS.toFixed(2)} MTS</span>
              </div>
            </CardContent>
          </Card>

          {/* FX Rates */}
          <div className="rounded-lg border bg-white dark:bg-zinc-900">
            <button onClick={() => setShowFx(!showFx)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-600">
              <span>Exchange Rates</span>
              {showFx ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showFx && (
              <div className="grid grid-cols-2 gap-3 border-t px-4 py-3 sm:grid-cols-3">
                {(Object.keys(fx) as (keyof FxRates)[]).map((k) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-10 text-zinc-400">1 USD =</span>
                    <input type="number" step="0.01" value={fx[k]} onChange={(e) => setFx((prev) => ({ ...prev, [k]: parseFloat(e.target.value) || 0 }))}
                      className="h-8 w-16 rounded border border-zinc-200 bg-transparent px-2 text-right font-mono text-sm outline-none focus:border-blue-300" />
                    <span className="text-zinc-500">{k}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MAIN COSTS */}
          <Card className="border-l-4 border-l-[#1B2A4A]">
            <CardHeader><CardTitle>Main Costs</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-zinc-50 text-xs text-zinc-400 dark:bg-zinc-800"><th className="px-3 py-1.5 text-left">Category</th><th className="px-1 py-1.5 text-right">Amount</th><th className="px-1 py-1.5">Cur.</th><th className="px-1 py-1.5">Unit</th><th className="px-2 py-1.5 text-right">USD Equiv.</th><th className="w-[30px]"></th></tr></thead>
                  <tbody>
                    {mainCosts.map((line, i) => (
                      <CostRowInput key={line.id} line={line} unitOptions={MAIN_UNITS[line.id]?.options ?? FLAT_UNITS}
                        onChange={(u) => setMainCosts((prev) => prev.map((l) => l.id === u.id ? u : l))} usdEquiv={mainCostsUSD[i]} />
                    ))}
                    <tr className="bg-zinc-50 font-bold dark:bg-zinc-800">
                      <td colSpan={4} className="px-3 py-2">MAIN COSTS TOTAL</td>
                      <td className="px-2 py-2 text-right font-mono">{fmtUSD(totalMainUSD)}</td><td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ADD-ON COSTS */}
          <Card>
            <CardHeader><CardTitle>Add-on Costs</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-zinc-50 text-xs text-zinc-400 dark:bg-zinc-800"><th className="px-3 py-1.5 text-left">Category</th><th className="px-1 py-1.5 text-right">Amount</th><th className="px-1 py-1.5">Cur.</th><th className="px-1 py-1.5">Unit</th><th className="px-2 py-1.5 text-right">USD Equiv.</th><th className="w-[30px]"></th></tr></thead>
                  <tbody>
                    {addOns.map((line, i) => (
                      <CostRowInput key={line.id} line={line} unitOptions={FLAT_UNITS}
                        onChange={(u) => setAddOns((prev) => prev.map((l) => l.id === u.id ? u : l))} usdEquiv={addOnsUSD[i]} />
                    ))}
                    {customItems.map((line, i) => (
                      <CostRowInput key={line.id} line={line} unitOptions={FLAT_UNITS}
                        onChange={(u) => setCustomItems((prev) => prev.map((l) => l.id === u.id ? u : l))}
                        onDelete={() => setCustomItems((prev) => prev.filter((l) => l.id !== line.id))}
                        usdEquiv={customUSD[i]} />
                    ))}
                    <tr className="border-b border-zinc-100">
                      <td colSpan={6} className="px-3 py-1.5">
                        <button onClick={addCustomItem} className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"><Plus className="h-3.5 w-3.5" /> Add Custom</button>
                      </td>
                    </tr>
                    <tr className="bg-zinc-50 font-bold dark:bg-zinc-800">
                      <td colSpan={4} className="px-3 py-2">ADD-ON TOTAL</td>
                      <td className="px-2 py-2 text-right font-mono">{fmtUSD(totalAddOnUSD)}</td><td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Target Margin */}
          <Card>
            <CardHeader><CardTitle>Target Margin</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-4">
              <input type="range" min={5} max={50} value={margin} onChange={(e) => setMargin(parseInt(e.target.value))} className="flex-1 accent-emerald-600" />
              <Input type="number" value={margin} onChange={(e) => setMargin(parseInt(e.target.value) || 0)} className="w-20 text-center" />
              <span className="text-sm text-zinc-400">%</span>
            </CardContent>
          </Card>
        </div>

        {/* ═══ RIGHT: RESULTS ═══ */}
        <div className="space-y-6">
          <Card className="border-2 border-emerald-200">
            <CardHeader><CardTitle>Cost Breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {/* Main costs */}
              <p className="text-xs font-semibold text-zinc-400">MAIN COSTS</p>
              {mainCosts.map((line, i) => mainCostsUSD[i] > 0 && (
                <div key={line.id} className="flex justify-between"><span className="text-zinc-500">{line.label}:</span><span className="font-mono">{fmtUSD(mainCostsUSD[i])}</span></div>
              ))}
              {/* Add-ons */}
              <p className="mt-2 text-xs font-semibold text-zinc-400">ADD-ON COSTS</p>
              {addOns.map((line, i) => addOnsUSD[i] > 0 && (
                <div key={line.id} className="flex justify-between"><span className="text-zinc-500">{line.label}:</span><span className="font-mono">{fmtUSD(addOnsUSD[i])}</span></div>
              ))}
              {customItems.map((line, i) => customUSD[i] > 0 && (
                <div key={line.id} className="flex justify-between"><span className="text-zinc-500">{line.label || "Custom"}:</span><span className="font-mono">{fmtUSD(customUSD[i])}</span></div>
              ))}

              <div className="border-t pt-2">
                <div className="flex justify-between text-base font-bold"><span>TOTAL LANDED COST:</span><span className="font-mono">{fmtUSD(landedCost)}</span></div>
                <div className="mt-1 flex justify-between text-zinc-500"><span>Cost per MT:</span><span className="font-mono">{fmtUSD(costPerMT)}</span></div>
                <div className="flex justify-between text-zinc-500"><span>Cost per Carton:</span><span className="font-mono">{fmtUSD(costPerCarton)}</span></div>
              </div>
              <div className="border-t pt-3">
                <p className="mb-2 text-xs font-semibold text-zinc-400">TARGET QUOTE ({margin}% margin)</p>
                <div className="flex justify-between font-bold text-emerald-700"><span>Selling Price/MT:</span><span className="font-mono text-lg">{fmtUSD(sellPerMT)}</span></div>
                <div className="flex justify-between"><span>Per Carton:</span><span className="font-mono">{fmtUSD(sellPerCarton)}</span></div>
                <div className="mt-1 flex justify-between text-base font-bold"><span>Total Contract:</span><span className="font-mono">{fmtUSD(sellTotal)}</span></div>
                <div className="mt-1 flex justify-between text-emerald-600"><span>Profit:</span><span className="font-mono font-bold">{fmtUSD(profit)}</span></div>
              </div>
              <div className="flex gap-2 border-t pt-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied!" : "Copy Quote"}
                </Button>
                <Button className="flex-1 gap-2" onClick={handleSaveDraft}><Save className="h-4 w-4" /> Save as Draft</Button>
              </div>
            </CardContent>
          </Card>

          {/* Margin Scenarios */}
          <Card>
            <CardHeader><CardTitle>Price Scenarios</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-zinc-400"><th className="pb-2">Margin</th><th className="pb-2 text-right">Price/MT</th><th className="pb-2 text-right">$/Carton</th><th className="pb-2 text-right">Total</th></tr></thead>
                <tbody>
                  {scenarios.map((s) => (
                    <tr key={s.margin} className={`border-b ${s.margin === margin ? "bg-emerald-50 font-bold dark:bg-emerald-950" : ""}`}>
                      <td className="py-2">{s.margin}%{s.margin === margin ? " \u2190" : ""}</td>
                      <td className="py-2 text-right font-mono">{fmtUSD0(s.priceMT)}</td>
                      <td className="py-2 text-right font-mono">{fmtUSD(s.priceCarton)}</td>
                      <td className="py-2 text-right font-mono">{fmtUSD0(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Price Comparison */}
          {priceComparisons.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Last Quoted Prices</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {priceComparisons.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span>{c.buyer}: <span className="font-mono font-medium">{fmtUSD0(c.priceMT)}/MT</span></span>
                      <span className={c.diff > 0 ? "text-amber-600" : "text-emerald-600"}>{c.diff > 0 ? "+" : ""}{c.diff.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
