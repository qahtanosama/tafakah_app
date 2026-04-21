"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Copy, Save, Check, Plus, X, ChevronDown, ChevronUp, Eye } from "lucide-react";
import type { ProductProfile } from "@/types/product";
import { getProducts, getPriceHistory } from "@/lib/products";
import { toArabicNum, toArabicFormatted } from "@/lib/arabic";

/* ── Types ─────────────────────────────────────── */
type Currency = "USD" | "RMB" | "EUR" | "SAR" | "AED" | "KWD";
type CostUnit = "per_kg" | "per_mt" | "per_carton" | "per_container" | "flat";

interface CostLine {
  id: string; label: string; description: string;
  amount: number; currency: Currency; unit: CostUnit; isPredefined: boolean;
}

interface FxRates { RMB: number; EUR: number; SAR: number; AED: number; KWD: number; }

const DEFAULT_FX: FxRates = { RMB: 7.24, EUR: 0.92, SAR: 3.75, AED: 3.67, KWD: 0.31 };
const CURRENCIES: Currency[] = ["USD", "RMB", "EUR", "SAR", "AED", "KWD"];
const CUR_LABELS: Record<Currency, string> = { USD: "USD", RMB: "RMB", EUR: "EUR", SAR: "SAR", AED: "AED", KWD: "KWD" };

const MAIN_UNITS: Record<string, { value: CostUnit; label: string }[]> = {
  supplier: [{ value: "per_kg", label: "Per KG" }, { value: "per_mt", label: "Per MT" }, { value: "per_carton", label: "Per Carton" }],
  packing: [{ value: "per_carton", label: "Per Carton" }, { value: "flat", label: "Flat Rate" }],
  freight: [{ value: "per_container", label: "Per Container" }, { value: "per_mt", label: "Per MT" }],
};
const FLAT_UNITS = [{ value: "flat" as CostUnit, label: "Flat Rate" }];
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
  const rate = fx[cur as keyof FxRates];
  return rate > 0 ? amount / rate : 0;
}

const PRODUCT_AR: Record<string, string> = {
  "Fresh Garlic": "ثوم طازج",
  "Fresh Ginger": "زنجبيل طازج",
  "Fresh Kiwi": "كيوي طازج",
  "Fresh Apple": "تفاح طازج",
  "Fresh Onion": "بصل طازج",
};

const CONTAINER_AR: Record<string, string> = {
  "1×40'RH": "١×٤٠ قدم مبرد",
  "1×40'HC": "١×٤٠ قدم عالي",
  "1×40'GP": "١×٤٠ قدم عادي",
  "1×20'GP": "١×٢٠ قدم عادي",
  "1×45'HC": "١×٤٥ قدم عالي",
};

/* ── Cost Row Component ────────────────────────── */
function CostRowInput({ line, unitOptions, onChange, onDelete, usdEquiv }: {
  line: CostLine; unitOptions: { value: CostUnit; label: string }[];
  onChange: (u: CostLine) => void; onDelete?: () => void; usdEquiv: number;
}) {
  return (
    <tr className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
      <td className="py-3 pr-4 pl-4 text-sm">
        {line.isPredefined ? (
          <span className="font-semibold text-slate-700 dark:text-slate-300">{line.label}</span>
        ) : (
          <input value={line.label} onChange={(e) => onChange({ ...line, label: e.target.value })} className="w-full bg-white/50 dark:bg-zinc-800/50 rounded-md px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/30" placeholder="Category name" />
        )}
      </td>
      <td className="w-[120px] px-2 py-2">
        <input type="number" step="0.01" value={line.amount || ""} onChange={(e) => onChange({ ...line, amount: parseFloat(e.target.value) || 0 })}
          className="h-9 w-full rounded-md border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-zinc-800/50 px-3 text-right font-mono text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="0" />
      </td>
      <td className="w-[90px] px-2 py-2">
        <select value={line.currency} onChange={(e) => onChange({ ...line, currency: e.target.value as Currency })}
          className="h-9 w-full rounded-md border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-zinc-800/50 px-2 text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer">
          {CURRENCIES.map((c) => <option key={c} value={c}>{CUR_LABELS[c]}</option>)}
        </select>
      </td>
      <td className="w-[130px] px-2 py-2">
        <select value={line.unit} onChange={(e) => onChange({ ...line, unit: e.target.value as CostUnit })}
          className="h-9 w-full rounded-md border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-zinc-800/50 px-2 text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer">
          {unitOptions.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </td>
      <td className="w-[120px] px-4 py-2 text-right font-mono text-sm font-medium text-slate-500 dark:text-slate-400">
        {line.amount > 0 ? fmtUSD(usdEquiv) : "—"}
      </td>
      <td className="w-[40px] px-2 py-2 text-center">
        {onDelete && <button onClick={onDelete} className="text-slate-400 hover:text-red-500 transition-colors rounded-md p-1 hover:bg-red-50 dark:hover:bg-red-500/10"><X className="h-4 w-4" /></button>}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════ */
/*  MAIN CALCULATOR                                */
/* ═══════════════════════════════════════════════ */
export default function QuoteCalculator() {
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [cartons, setCartons] = useState(9700);
  const [containerType, setContainerType] = useState("1×40'RH");
  const [mainCosts, setMainCosts] = useState<CostLine[]>(defaultMainCosts());
  const [addOns, setAddOns] = useState<CostLine[]>(defaultAddOns());
  const [customItems, setCustomItems] = useState<CostLine[]>([]);
  const [fx, setFx] = useState<FxRates>(DEFAULT_FX);
  const [showFx, setShowFx] = useState(false);
  const [margin, setMargin] = useState(20);
  const [copied, setCopied] = useState(false);
  const [quoteLang, setQuoteLang] = useState<"en" | "ar">("en");
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const prods = getProducts();
    setProducts(prods);
    if (prods.length > 0) setSelectedId(prods[0].id);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.mainCosts) setMainCosts(s.mainCosts);
        if (s.addOns) setAddOns(s.addOns);
        if (s.customItems) setCustomItems(s.customItems);
        if (s.fxRates) setFx(s.fxRates);
        if (s.targetMargin) setMargin(s.targetMargin);
      }
      const lang = localStorage.getItem("calculator.quoteLanguage");
      if (lang === "ar") setQuoteLang("ar");
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mainCosts, addOns, customItems, fxRates: fx, targetMargin: margin })); } catch {}
  }, [mainCosts, addOns, customItems, fx, margin]);

  useEffect(() => {
    try { localStorage.setItem("calculator.quoteLanguage", quoteLang); } catch {}
  }, [quoteLang]);

  const product = useMemo(() => products.find((p) => p.id === selectedId), [products, selectedId]);
  useEffect(() => { if (product) setContainerType(product.containerType); }, [product]);

  const nw = product?.defaultNW ?? 0;
  const gw = product?.defaultGW ?? 0;
  const totalNW = nw * cartons;
  const qtyMTS = totalNW / 1000;

  const calcLineUSD = useCallback((line: CostLine): number => {
    const amtUSD = toUSD(line.amount, line.currency, fx);
    switch (line.unit) {
      case "per_kg": return amtUSD * totalNW;
      case "per_mt": return amtUSD * qtyMTS;
      case "per_carton": return amtUSD * cartons;
      case "per_container": case "flat": return amtUSD;
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

  // Generate quote text
  const generateQuote = useCallback((lang: "en" | "ar"): string => {
    if (!product) return "";
    if (lang === "ar") {
      const pName = PRODUCT_AR[product.name] ?? product.name;
      const cType = CONTAINER_AR[containerType] ?? containerType;
      return `📦 عرض سعر — شركة تفكه للأغذية (شنغهاي)\n\nالمنتج: ${pName}\nالحجم: ${toArabicNum(nw, 1)} كجم / كرتون\nالحاوية: ${cType} (${toArabicFormatted(cartons)} كرتون)\nالكمية: ${toArabicNum(qtyMTS, 2)} طن متري\n\nالسعر لكل طن: ${toArabicFormatted(Math.round(sellPerMT))} دولار أمريكي\nالسعر لكل كرتون: ${toArabicNum(sellPerCarton, 2)} دولار أمريكي\nالقيمة الإجمالية: ${toArabicFormatted(Math.round(sellTotal))} دولار أمريكي\n\nالشروط: CIF (قابل للتفاوض)\nصلاحية العرض: ${toArabicNum(7)} أيام من تاريخه\n\n— شركة تفكه للأغذية (شنغهاي) المحدودة\n📧 info@taifukai.com\n📱 +86 187 2116 0270`;
    }
    return `📦 Quote — TAFAKAH Food (Shanghai) Co., Ltd.\n\nProduct: ${product.name}\nSize: ${nw} KG / Carton\nContainer: ${containerType} (${cartons.toLocaleString()} cartons)\nQuantity: ${qtyMTS.toFixed(2)} MTS\n\nPrice per MT: ${fmtUSD0(sellPerMT)} USD\nPrice per Carton: ${fmtUSD(sellPerCarton)} USD\nTotal Value: ${fmtUSD0(sellTotal)} USD\n\nTerms: CIF (negotiable)\nValid: 7 days from today\n\n— TAFAKAH Food (Shanghai) Co., Ltd.\n📧 info@taifukai.com\n📱 +86 187 2116 0270`;
  }, [product, nw, containerType, cartons, qtyMTS, sellPerMT, sellPerCarton, sellTotal]);

  const handleCopy = useCallback(() => {
    const text = showPreview ? previewText : generateQuote(quoteLang);
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    if (showPreview) setShowPreview(false);
  }, [quoteLang, generateQuote, showPreview, previewText]);

  const handlePreview = useCallback(() => {
    setPreviewText(generateQuote(quoteLang));
    setShowPreview(true);
  }, [quoteLang, generateQuote]);

  const handleSaveDraft = useCallback(() => {
    if (!product) return;
    localStorage.setItem("master-draft", JSON.stringify({ product: product.name, nwPerCarton: nw, gwPerCarton: gw, cartons, pricePerMT: Math.round(sellPerMT * 100) / 100, containerType }));
    setToast("Draft saved. Open Master Data to continue."); setTimeout(() => setToast(null), 3000);
  }, [product, nw, gw, cartons, sellPerMT, containerType]);

  const addCustomItem = useCallback(() => {
    setCustomItems((prev) => [...prev, { id: `c-${crypto.randomUUID().slice(0, 8)}`, label: "", description: "", amount: 0, currency: "USD", unit: "flat", isPredefined: false }]);
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 font-sans">
      {toast && <div className="fixed top-20 right-8 z-50 rounded-xl border border-emerald-200 bg-emerald-50/90 backdrop-blur-md px-6 py-4 text-sm font-semibold text-emerald-800 shadow-xl shadow-emerald-500/10 transition-all animate-in fade-in slide-in-from-top-4">{toast}</div>}

      {/* ═══ TOP ROW: Product + Container + FX ═══ */}
      <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_auto]">
        <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 pb-4">
            <CardTitle className="text-xl text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span> Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid gap-6 sm:grid-cols-4 items-end">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600 dark:text-slate-400">Product</Label>
              <Select value={selectedId} onValueChange={(v) => v && setSelectedId(v)}>
                <SelectTrigger className="h-10 bg-white dark:bg-zinc-800 border-slate-200 dark:border-white/10 text-slate-800 font-medium focus:ring-indigo-500/20"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id} className="font-medium">{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600 dark:text-slate-400">Container</Label>
              <Select value={containerType} onValueChange={(v) => v && setContainerType(v)}>
                <SelectTrigger className="h-10 bg-white dark:bg-zinc-800 border-slate-200 dark:border-white/10 text-slate-800 font-medium focus:ring-indigo-500/20"><SelectValue /></SelectTrigger>
                <SelectContent>{["1×20'GP", "1×40'GP", "1×40'HC", "1×40'RH", "1×45'HC"].map((t) => <SelectItem key={t} value={t} className="font-medium">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600 dark:text-slate-400">Cartons</Label>
              <Input type="number" value={cartons} onChange={(e) => setCartons(parseInt(e.target.value) || 0)} className="h-10 bg-white dark:bg-zinc-800 border-slate-200 dark:border-white/10 font-mono text-base focus:border-indigo-400 focus:ring-indigo-500/20" />
            </div>
            <div className="flex flex-col justify-end gap-1.5 p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-500/5 text-sm font-medium text-indigo-900 dark:text-indigo-200 border border-indigo-100/50 dark:border-indigo-500/10">
              <div className="flex justify-between"><span>Net Weight:</span> <span className="font-mono font-bold">{totalNW.toLocaleString()} KG</span></div>
              <div className="flex justify-between"><span>Total Qty:</span> <span className="font-mono font-bold">{qtyMTS.toFixed(2)} MTS</span></div>
            </div>
          </CardContent>
        </Card>

        <div className="w-full rounded-xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-sm lg:w-[320px] overflow-hidden">
          <button onClick={() => setShowFx(!showFx)} className="flex w-full items-center justify-between px-6 py-5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-cyan-500"></span> Exchange Rates</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800">
              {showFx ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>
          {showFx && (
            <div className="space-y-3 border-t border-slate-100 dark:border-white/5 px-6 py-5 bg-slate-50/30 dark:bg-black/10">
              {(Object.keys(fx) as (keyof FxRates)[]).map((k) => (
                <div key={k} className="flex items-center gap-3 text-sm">
                  <span className="w-16 font-medium text-slate-500">1 USD =</span>
                  <input type="number" step="0.01" value={fx[k]} onChange={(e) => setFx((p) => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                    className="h-9 flex-1 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 text-right font-mono text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                  <span className="font-bold text-slate-600 dark:text-slate-300 w-8">{k}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ TWO-COLUMN LAYOUT ═══ */}
      <div className="grid gap-8 lg:grid-cols-[55%_45%]">
        {/* LEFT: INPUTS */}
        <div className="space-y-8">
          {/* Main Costs */}
          <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden border-l-4 border-l-indigo-500">
            <CardHeader className="pb-2 pt-6 px-6">
              <CardTitle className="text-xl font-bold text-slate-800 dark:text-white">Main Costs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-white/5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3 text-left">Category</th><th className="px-2 py-3 text-right">Amount</th><th className="px-2 py-3 text-left">Currency</th><th className="px-2 py-3 text-left">Unit</th><th className="px-4 py-3 text-right">USD Equiv.</th><th className="w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mainCosts.map((line, i) => (
                      <CostRowInput key={line.id} line={line} unitOptions={MAIN_UNITS[line.id] ?? FLAT_UNITS}
                        onChange={(u) => setMainCosts((p) => p.map((l) => l.id === u.id ? u : l))} usdEquiv={mainCostsUSD[i]} />
                    ))}
                    <tr className="bg-indigo-50/50 dark:bg-indigo-500/5 font-bold">
                      <td colSpan={4} className="px-4 py-4 text-indigo-900 dark:text-indigo-200">MAIN COSTS TOTAL</td>
                      <td className="px-4 py-4 text-right font-mono text-base text-indigo-700 dark:text-indigo-300">{fmtUSD(totalMainUSD)}</td><td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Add-on Costs */}
          <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
            <CardHeader className="pb-2 pt-6 px-6">
              <CardTitle className="text-xl font-bold text-slate-800 dark:text-white">Add-on Costs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-white/5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3 text-left">Category</th><th className="px-2 py-3 text-right">Amount</th><th className="px-2 py-3 text-left">Currency</th><th className="px-2 py-3 text-left">Unit</th><th className="px-4 py-3 text-right">USD Equiv.</th><th className="w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {addOns.map((line, i) => (
                      <CostRowInput key={line.id} line={line} unitOptions={FLAT_UNITS}
                        onChange={(u) => setAddOns((p) => p.map((l) => l.id === u.id ? u : l))} usdEquiv={addOnsUSD[i]} />
                    ))}
                    {customItems.map((line, i) => (
                      <CostRowInput key={line.id} line={line} unitOptions={FLAT_UNITS}
                        onChange={(u) => setCustomItems((p) => p.map((l) => l.id === u.id ? u : l))}
                        onDelete={() => setCustomItems((p) => p.filter((l) => l.id !== line.id))} usdEquiv={customUSD[i]} />
                    ))}
                    <tr className="border-b border-slate-100 dark:border-white/5">
                      <td colSpan={6} className="px-4 py-3">
                        <button onClick={addCustomItem} className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 transition-colors bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 px-3 py-1.5 rounded-md w-max">
                          <Plus className="h-4 w-4" /> Add Custom Field
                        </button>
                      </td>
                    </tr>
                    <tr className="bg-slate-50/80 dark:bg-white/5 font-bold">
                      <td colSpan={4} className="px-4 py-4 text-slate-700 dark:text-slate-300">ADD-ON TOTAL</td>
                      <td className="px-4 py-4 text-right font-mono text-base text-slate-800 dark:text-white">{fmtUSD(totalAddOnUSD)}</td><td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: RESULTS (sticky) */}
        <div className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          
          {/* Target Margin Slider */}
          <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-emerald-500/10 to-transparent pb-4">
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-white">Target Profit Margin</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex items-center gap-6">
              <input type="range" min={5} max={50} value={margin} onChange={(e) => setMargin(parseInt(e.target.value))} className="flex-1 h-2 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
              <div className="relative">
                <Input type="number" value={margin} onChange={(e) => setMargin(parseInt(e.target.value) || 0)} className="w-24 text-center font-bold text-lg h-12 bg-white dark:bg-zinc-800 border-emerald-200 dark:border-emerald-900 focus:ring-emerald-500/30 pr-8" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-600 dark:text-emerald-400">%</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-zinc-900 border-2 border-emerald-200/60 dark:border-emerald-500/20 shadow-xl shadow-emerald-500/5">
            <CardHeader className="pb-2 pt-6">
              <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                Cost & Quote Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 px-6 pb-6 text-sm">
              <div>
                <p className="text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-2">MAIN COSTS</p>
                <div className="space-y-1">
                  {mainCosts.map((l, i) => mainCostsUSD[i] > 0 && <div key={l.id} className="flex justify-between pl-2"><span className="text-slate-600 dark:text-slate-400 font-medium">{l.label}:</span><span className="font-mono font-medium text-slate-800 dark:text-slate-200">{fmtUSD(mainCostsUSD[i])}</span></div>)}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-2">ADD-ON COSTS</p>
                <div className="space-y-1">
                  {addOns.map((l, i) => addOnsUSD[i] > 0 && <div key={l.id} className="flex justify-between pl-2"><span className="text-slate-600 dark:text-slate-400 font-medium">{l.label}:</span><span className="font-mono font-medium text-slate-800 dark:text-slate-200">{fmtUSD(addOnsUSD[i])}</span></div>)}
                  {customItems.map((l, i) => customUSD[i] > 0 && <div key={l.id} className="flex justify-between pl-2"><span className="text-slate-600 dark:text-slate-400 font-medium">{l.label || "Custom"}:</span><span className="font-mono font-medium text-slate-800 dark:text-slate-200">{fmtUSD(customUSD[i])}</span></div>)}
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-white/10 pt-4 pb-2 bg-slate-50/50 dark:bg-white/5 -mx-6 px-6">
                <div className="flex justify-between text-[15px] font-bold text-slate-800 dark:text-slate-200"><span>TOTAL LANDED COST:</span><span className="font-mono">{fmtUSD(landedCost)}</span></div>
                <div className="mt-2 flex justify-between text-slate-500 dark:text-slate-400 font-medium"><span>Cost per MT:</span><span className="font-mono">{fmtUSD(costPerMT)}</span></div>
                <div className="mt-1 flex justify-between text-slate-500 dark:text-slate-400 font-medium"><span>Cost per Carton:</span><span className="font-mono">{fmtUSD(costPerCarton)}</span></div>
              </div>

              <div className="border-t-2 border-emerald-100 dark:border-emerald-900/50 pt-5 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded">TARGET QUOTE ({margin}% MARGIN)</p>
                </div>
                <div className="flex justify-between font-extrabold text-emerald-700 dark:text-emerald-400 items-end">
                  <span className="text-base pb-1">Selling Price/MT:</span>
                  <span className="font-mono text-3xl tracking-tight">{fmtUSD(sellPerMT)}</span>
                </div>
                <div className="flex justify-between mt-2 font-medium text-slate-600 dark:text-slate-300"><span>Price Per Carton:</span><span className="font-mono">{fmtUSD(sellPerCarton)}</span></div>
                <div className="mt-3 flex justify-between text-[15px] font-bold text-slate-800 dark:text-white"><span>Total Contract Value:</span><span className="font-mono">{fmtUSD(sellTotal)}</span></div>
                <div className="mt-2 flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-500/10 p-2 rounded-lg"><span>Estimated Profit:</span><span className="font-mono text-lg">{fmtUSD(profit)}</span></div>
              </div>

              {/* Language toggle + actions */}
              <div className="border-t border-slate-200 dark:border-white/10 pt-5 mt-2">
                <div className="mb-4 flex items-center gap-2 p-1 bg-slate-100 dark:bg-zinc-800 rounded-lg w-max">
                  <button onClick={() => setQuoteLang("en")} className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${quoteLang === "en" ? "bg-white dark:bg-zinc-600 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>EN</button>
                  <button onClick={() => setQuoteLang("ar")} className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${quoteLang === "ar" ? "bg-white dark:bg-zinc-600 text-slate-800 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>AR</button>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 gap-2 h-11 border-slate-200 dark:border-white/10 bg-white/50 dark:bg-zinc-800/50 hover:bg-slate-50 hover:text-indigo-600 transition-all font-semibold" onClick={handlePreview}><Eye className="h-4 w-4" /> Preview</Button>
                  <Button variant="outline" className="flex-1 gap-2 h-11 border-slate-200 dark:border-white/10 bg-white/50 dark:bg-zinc-800/50 hover:bg-slate-50 hover:text-emerald-600 transition-all font-semibold" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button className="flex-1 gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 font-bold" onClick={handleSaveDraft}><Save className="h-4 w-4" /> Draft</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scenarios */}
          <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
            <CardHeader className="pb-2 pt-6">
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-white">Price Scenarios</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 text-left text-xs font-bold tracking-wider text-slate-400"><th className="py-3 pl-6">Margin</th><th className="py-3 text-right">Price/MT</th><th className="py-3 text-right">$/Carton</th><th className="py-3 pr-6 text-right">Total</th></tr></thead>
                <tbody>{scenarios.map((s) => (
                  <tr key={s.margin} className={`border-b border-slate-50 dark:border-white/5 transition-colors ${s.margin === margin ? "bg-emerald-50 dark:bg-emerald-500/10 font-bold text-emerald-900 dark:text-emerald-100" : "hover:bg-slate-50/50 dark:hover:bg-white/5 font-medium text-slate-600 dark:text-slate-300"}`}>
                    <td className="py-3 pl-6 flex items-center gap-2">{s.margin}% {s.margin === margin && <span className="h-2 w-2 rounded-full bg-emerald-500"></span>}</td>
                    <td className="py-3 text-right font-mono">{fmtUSD0(s.priceMT)}</td>
                    <td className="py-3 text-right font-mono">{fmtUSD(s.priceCarton)}</td>
                    <td className="py-3 pr-6 text-right font-mono">{fmtUSD0(s.total)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>

          {priceComparisons.length > 0 && (
            <Card className="bg-white dark:bg-zinc-900 border-slate-200/60 dark:border-white/10 shadow-sm">
              <CardHeader className="pb-4 pt-6">
                <CardTitle className="text-lg font-bold text-slate-800 dark:text-white">Last Quoted Prices</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="space-y-3">{priceComparisons.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-3 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{c.buyer}</span>
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{fmtUSD0(c.priceMT)}<span className="text-xs text-slate-400">/MT</span></span>
                      <span className={`font-bold px-2 py-0.5 rounded text-xs ${c.diff > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"}`}>{c.diff > 0 ? "+" : ""}{c.diff.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ═══ PREVIEW MODAL ═══ */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 p-1 shadow-2xl overflow-hidden border border-slate-200 dark:border-white/10 scale-in-95 animate-in duration-200">
            <div className="bg-slate-50 dark:bg-zinc-800/50 p-6 rounded-xl border border-slate-100 dark:border-white/5 m-1">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Quote Preview <span className="text-sm font-medium text-slate-500">({quoteLang === "ar" ? "Arabic" : "English"})</span></h3>
                <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors bg-white dark:bg-zinc-800 hover:bg-slate-100 rounded-full p-1"><X className="h-5 w-5" /></button>
              </div>
              <textarea
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                className="h-[360px] w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 p-5 font-mono text-sm leading-relaxed text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 shadow-inner transition-all"
                dir={quoteLang === "ar" ? "rtl" : "ltr"}
              />
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setShowPreview(false)} className="font-semibold text-slate-500 hover:text-slate-800">Close</Button>
                <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 font-bold px-6" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied!" : "Copy to Clipboard"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
