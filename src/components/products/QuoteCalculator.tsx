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

/* ── Arabic helpers ────────────────────────────── */
const AR_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
function toArabicNum(n: number, decimals = 0): string {
  const str = n.toFixed(decimals);
  return str.replace(/\d/g, (d) => AR_DIGITS[parseInt(d)])
    .replace(/\./g, "\u066B")
    .replace(/,/g, "\u066C");
}
function toArabicFormatted(n: number, decimals = 0): string {
  const parts = n.toFixed(decimals).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const full = parts[1] ? `${intPart}.${parts[1]}` : intPart;
  return full.replace(/\d/g, (d) => AR_DIGITS[parseInt(d)])
    .replace(/\./g, "\u066B")
    .replace(/,/g, "\u066C");
}

const PRODUCT_AR: Record<string, string> = {
  "Fresh Garlic": "\u062B\u0648\u0645 \u0637\u0627\u0632\u062C",
  "Fresh Ginger": "\u0632\u0646\u062C\u0628\u064A\u0644 \u0637\u0627\u0632\u062C",
  "Fresh Kiwi": "\u0643\u064A\u0648\u064A \u0637\u0627\u0632\u062C",
  "Fresh Apple": "\u062A\u0641\u0627\u062D \u0637\u0627\u0632\u062C",
  "Fresh Onion": "\u0628\u0635\u0644 \u0637\u0627\u0632\u062C",
};

const CONTAINER_AR: Record<string, string> = {
  "1\u00d740'RH": "\u0661\u00d7\u0664\u0660 \u0642\u062F\u0645 \u0645\u0628\u0631\u062F",
  "1\u00d740'HC": "\u0661\u00d7\u0664\u0660 \u0642\u062F\u0645 \u0639\u0627\u0644\u064A",
  "1\u00d740'GP": "\u0661\u00d7\u0664\u0660 \u0642\u062F\u0645 \u0639\u0627\u062F\u064A",
  "1\u00d720'GP": "\u0661\u00d7\u0662\u0660 \u0642\u062F\u0645 \u0639\u0627\u062F\u064A",
  "1\u00d745'HC": "\u0661\u00d7\u0664\u0665 \u0642\u062F\u0645 \u0639\u0627\u0644\u064A",
};

/* ── Cost Row Component ────────────────────────── */
function CostRowInput({ line, unitOptions, onChange, onDelete, usdEquiv }: {
  line: CostLine; unitOptions: { value: CostUnit; label: string }[];
  onChange: (u: CostLine) => void; onDelete?: () => void; usdEquiv: number;
}) {
  return (
    <tr className="border-b border-zinc-100 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
      <td className="py-2 pr-2 text-sm">
        {line.isPredefined ? (
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{line.label}</span>
        ) : (
          <input value={line.label} onChange={(e) => onChange({ ...line, label: e.target.value })} className="w-full bg-transparent text-sm font-medium outline-none" placeholder="Category name" />
        )}
      </td>
      <td className="w-[100px] px-1 py-1.5">
        <input type="number" step="0.01" value={line.amount || ""} onChange={(e) => onChange({ ...line, amount: parseFloat(e.target.value) || 0 })}
          className="h-9 w-full rounded border border-zinc-200 bg-transparent px-2 text-right font-mono text-sm outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200" placeholder="0" />
      </td>
      <td className="w-[80px] px-1 py-1.5">
        <select value={line.currency} onChange={(e) => onChange({ ...line, currency: e.target.value as Currency })}
          className="h-9 w-full rounded border border-zinc-200 bg-transparent px-1 text-sm outline-none focus:border-blue-300">
          {CURRENCIES.map((c) => <option key={c} value={c}>{CUR_LABELS[c]}</option>)}
        </select>
      </td>
      <td className="w-[115px] px-1 py-1.5">
        <select value={line.unit} onChange={(e) => onChange({ ...line, unit: e.target.value as CostUnit })}
          className="h-9 w-full rounded border border-zinc-200 bg-transparent px-1 text-sm outline-none focus:border-blue-300">
          {unitOptions.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </td>
      <td className="w-[110px] px-2 py-1.5 text-right font-mono text-sm text-zinc-500">
        {line.amount > 0 ? fmtUSD(usdEquiv) : "\u2014"}
      </td>
      <td className="w-[32px] px-1 py-1.5">
        {onDelete && <button onClick={onDelete} className="text-zinc-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>}
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
  const [containerType, setContainerType] = useState("1\u00d740'RH");
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
      return `\uD83D\uDCE6 \u0639\u0631\u0636 \u0633\u0639\u0631 \u2014 \u0634\u0631\u0643\u0629 \u062A\u0641\u0643\u0647 \u0644\u0644\u0623\u063A\u0630\u064A\u0629 (\u0634\u0646\u063A\u0647\u0627\u064A)\n\n\u0627\u0644\u0645\u0646\u062A\u062C: ${pName}\n\u0627\u0644\u062D\u062C\u0645: ${toArabicNum(nw, 1)} \u0643\u062C\u0645 / \u0643\u0631\u062A\u0648\u0646\n\u0627\u0644\u062D\u0627\u0648\u064A\u0629: ${cType} (${toArabicFormatted(cartons)} \u0643\u0631\u062A\u0648\u0646)\n\u0627\u0644\u0643\u0645\u064A\u0629: ${toArabicNum(qtyMTS, 2)} \u0637\u0646 \u0645\u062A\u0631\u064A\n\n\u0627\u0644\u0633\u0639\u0631 \u0644\u0643\u0644 \u0637\u0646: ${toArabicFormatted(Math.round(sellPerMT))} \u062F\u0648\u0644\u0627\u0631 \u0623\u0645\u0631\u064A\u0643\u064A\n\u0627\u0644\u0633\u0639\u0631 \u0644\u0643\u0644 \u0643\u0631\u062A\u0648\u0646: ${toArabicNum(sellPerCarton, 2)} \u062F\u0648\u0644\u0627\u0631 \u0623\u0645\u0631\u064A\u0643\u064A\n\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A\u0629: ${toArabicFormatted(Math.round(sellTotal))} \u062F\u0648\u0644\u0627\u0631 \u0623\u0645\u0631\u064A\u0643\u064A\n\n\u0627\u0644\u0634\u0631\u0648\u0637: CIF (\u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u0641\u0627\u0648\u0636)\n\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0639\u0631\u0636: ${toArabicNum(7)} \u0623\u064A\u0627\u0645 \u0645\u0646 \u062A\u0627\u0631\u064A\u062E\u0647\n\n\u2014 \u0634\u0631\u0643\u0629 \u062A\u0641\u0643\u0647 \u0644\u0644\u0623\u063A\u0630\u064A\u0629 (\u0634\u0646\u063A\u0647\u0627\u064A) \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629\n\uD83D\uDCE7 info@taifukai.com\n\uD83D\uDCF1 +86 187 2116 0270`;
    }
    return `\uD83D\uDCE6 Quote \u2014 TAFAKAH Food (Shanghai) Co., Ltd.\n\nProduct: ${product.name}\nSize: ${nw} KG / Carton\nContainer: ${containerType} (${cartons.toLocaleString()} cartons)\nQuantity: ${qtyMTS.toFixed(2)} MTS\n\nPrice per MT: ${fmtUSD0(sellPerMT)} USD\nPrice per Carton: ${fmtUSD(sellPerCarton)} USD\nTotal Value: ${fmtUSD0(sellTotal)} USD\n\nTerms: CIF (negotiable)\nValid: 7 days from today\n\n\u2014 TAFAKAH Food (Shanghai) Co., Ltd.\n\uD83D\uDCE7 info@taifukai.com\n\uD83D\uDCF1 +86 187 2116 0270`;
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
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      {toast && <div className="fixed top-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 shadow-lg">{toast}</div>}

      {/* ═══ TOP ROW: Product + Container + FX ═══ */}
      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto]">
        <Card>
          <CardHeader><CardTitle>Product & Container</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
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
            <div className="flex flex-col justify-end gap-1 text-sm text-zinc-500">
              <span>N.W.: {totalNW.toLocaleString()} KG</span>
              <span>Qty: {qtyMTS.toFixed(2)} MTS</span>
            </div>
          </CardContent>
        </Card>

        <div className="w-full rounded-xl border bg-white shadow-sm lg:w-[280px] dark:bg-zinc-900">
          <button onClick={() => setShowFx(!showFx)} className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold text-zinc-600">
            <span>Exchange Rates</span>
            {showFx ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showFx && (
            <div className="space-y-2 border-t px-5 py-4">
              {(Object.keys(fx) as (keyof FxRates)[]).map((k) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-16 text-zinc-400">1 USD =</span>
                  <input type="number" step="0.01" value={fx[k]} onChange={(e) => setFx((p) => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                    className="h-8 w-20 rounded border border-zinc-200 bg-transparent px-2 text-right font-mono text-sm outline-none focus:border-blue-300" />
                  <span className="text-zinc-500">{k}</span>
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
          <Card className="border-l-4 border-l-[#1B2A4A] bg-[#FAFAF8] dark:bg-zinc-900">
            <CardHeader><CardTitle className="text-xl text-[#1B2A4A] dark:text-zinc-200">Main Costs</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-zinc-100/60 text-xs font-semibold text-zinc-400 dark:bg-zinc-800/50"><th className="px-4 py-2 text-left">Category</th><th className="px-1 py-2 text-right">Amount</th><th className="px-1 py-2">Currency</th><th className="px-1 py-2">Unit</th><th className="px-2 py-2 text-right">USD Equiv.</th><th className="w-[32px]"></th></tr></thead>
                  <tbody>
                    {mainCosts.map((line, i) => (
                      <CostRowInput key={line.id} line={line} unitOptions={MAIN_UNITS[line.id] ?? FLAT_UNITS}
                        onChange={(u) => setMainCosts((p) => p.map((l) => l.id === u.id ? u : l))} usdEquiv={mainCostsUSD[i]} />
                    ))}
                    <tr className="bg-zinc-100/60 font-bold dark:bg-zinc-800/50">
                      <td colSpan={4} className="px-4 py-3">MAIN COSTS TOTAL</td>
                      <td className="px-2 py-3 text-right font-mono">{fmtUSD(totalMainUSD)}</td><td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Add-on Costs */}
          <Card>
            <CardHeader><CardTitle>Add-on Costs</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-zinc-50 text-xs text-zinc-400 dark:bg-zinc-800/50"><th className="px-4 py-2 text-left">Category</th><th className="px-1 py-2 text-right">Amount</th><th className="px-1 py-2">Currency</th><th className="px-1 py-2">Unit</th><th className="px-2 py-2 text-right">USD Equiv.</th><th className="w-[32px]"></th></tr></thead>
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
                    <tr className="border-b border-zinc-100"><td colSpan={6} className="px-4 py-2">
                      <button onClick={addCustomItem} className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"><Plus className="h-3.5 w-3.5" /> Add Custom</button>
                    </td></tr>
                    <tr className="bg-zinc-50 font-bold dark:bg-zinc-800/50">
                      <td colSpan={4} className="px-4 py-3">ADD-ON TOTAL</td>
                      <td className="px-2 py-3 text-right font-mono">{fmtUSD(totalAddOnUSD)}</td><td></td>
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

        {/* RIGHT: RESULTS (sticky) */}
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="border-2 border-emerald-200">
            <CardHeader><CardTitle>Cost Breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-xs font-semibold text-zinc-400">MAIN COSTS</p>
              {mainCosts.map((l, i) => mainCostsUSD[i] > 0 && <div key={l.id} className="flex justify-between pl-2"><span className="text-zinc-500">{l.label}:</span><span className="font-mono">{fmtUSD(mainCostsUSD[i])}</span></div>)}

              <p className="mt-3 text-xs font-semibold text-zinc-400">ADD-ON COSTS</p>
              {addOns.map((l, i) => addOnsUSD[i] > 0 && <div key={l.id} className="flex justify-between pl-2"><span className="text-zinc-500">{l.label}:</span><span className="font-mono">{fmtUSD(addOnsUSD[i])}</span></div>)}
              {customItems.map((l, i) => customUSD[i] > 0 && <div key={l.id} className="flex justify-between pl-2"><span className="text-zinc-500">{l.label || "Custom"}:</span><span className="font-mono">{fmtUSD(customUSD[i])}</span></div>)}

              <div className="border-t pt-3">
                <div className="flex justify-between text-base font-bold"><span>TOTAL LANDED COST:</span><span className="font-mono">{fmtUSD(landedCost)}</span></div>
                <div className="mt-1.5 flex justify-between text-zinc-500"><span>Cost per MT:</span><span className="font-mono">{fmtUSD(costPerMT)}</span></div>
                <div className="flex justify-between text-zinc-500"><span>Cost per Carton:</span><span className="font-mono">{fmtUSD(costPerCarton)}</span></div>
              </div>

              <div className="border-t pt-3">
                <p className="mb-2 text-xs font-semibold text-zinc-400">TARGET QUOTE ({margin}% margin)</p>
                <div className="flex justify-between font-bold text-emerald-700"><span>Selling Price/MT:</span><span className="font-mono text-lg">{fmtUSD(sellPerMT)}</span></div>
                <div className="flex justify-between"><span>Per Carton:</span><span className="font-mono">{fmtUSD(sellPerCarton)}</span></div>
                <div className="mt-1.5 flex justify-between text-base font-bold"><span>Total Contract:</span><span className="font-mono">{fmtUSD(sellTotal)}</span></div>
                <div className="mt-1 flex justify-between text-emerald-600"><span>Profit:</span><span className="font-mono font-bold">{fmtUSD(profit)}</span></div>
              </div>

              {/* Language toggle + actions */}
              <div className="border-t pt-3">
                <div className="mb-3 flex items-center gap-2">
                  <button onClick={() => setQuoteLang("en")} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${quoteLang === "en" ? "bg-[#1B2A4A] text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>EN</button>
                  <button onClick={() => setQuoteLang("ar")} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${quoteLang === "ar" ? "bg-[#1B2A4A] text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>AR</button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handlePreview}><Eye className="h-4 w-4" /> Preview</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button size="sm" className="flex-1 gap-1.5" onClick={handleSaveDraft}><Save className="h-4 w-4" /> Draft</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scenarios */}
          <Card>
            <CardHeader><CardTitle>Price Scenarios</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-zinc-400"><th className="pb-2">Margin</th><th className="pb-2 text-right">Price/MT</th><th className="pb-2 text-right">$/Carton</th><th className="pb-2 text-right">Total</th></tr></thead>
                <tbody>{scenarios.map((s) => (
                  <tr key={s.margin} className={`border-b ${s.margin === margin ? "bg-emerald-50 font-bold dark:bg-emerald-950" : ""}`}>
                    <td className="py-2">{s.margin}%{s.margin === margin ? " \u2190" : ""}</td>
                    <td className="py-2 text-right font-mono">{fmtUSD0(s.priceMT)}</td>
                    <td className="py-2 text-right font-mono">{fmtUSD(s.priceCarton)}</td>
                    <td className="py-2 text-right font-mono">{fmtUSD0(s.total)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>

          {priceComparisons.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Last Quoted Prices</CardTitle></CardHeader>
              <CardContent><div className="space-y-2">{priceComparisons.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{c.buyer}: <span className="font-mono font-medium">{fmtUSD0(c.priceMT)}/MT</span></span>
                  <span className={c.diff > 0 ? "text-amber-600" : "text-emerald-600"}>{c.diff > 0 ? "+" : ""}{c.diff.toFixed(0)}%</span>
                </div>
              ))}</div></CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ═══ PREVIEW MODAL ═══ */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Quote Preview ({quoteLang === "ar" ? "Arabic" : "English"})</h3>
              <button onClick={() => setShowPreview(false)} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
            </div>
            <textarea
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              className="h-80 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm leading-relaxed outline-none focus:border-blue-300 dark:bg-zinc-800"
              dir={quoteLang === "ar" ? "rtl" : "ltr"}
            />
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
              <Button className="gap-2" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied!" : "Copy to Clipboard"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
