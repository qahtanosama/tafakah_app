"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Copy, Save, Check } from "lucide-react";
import type { ProductProfile } from "@/types/product";
import { getProducts, getPriceHistory } from "@/lib/products";

const CALC_KEYS = {
  fxRate: "calculator.fxRate",
  addons: "calculator.defaultAddons",
  margin: "calculator.targetMargin",
};

const DEFAULT_ADDONS = [
  { label: "Export Fee (EXP)", amount: 450 },
  { label: "Packing Materials", amount: 1200 },
  { label: "Customs & Port", amount: 680 },
  { label: "Sea Freight", amount: 3800 },
  { label: "Insurance", amount: 150 },
  { label: "Inspection / Phyto", amount: 220 },
  { label: "Trucking", amount: 500 },
  { label: "Bank Charges", amount: 80 },
];

function fmtUSD(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUSD0(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function QuoteCalculator() {
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [priceUnit, setPriceUnit] = useState<"kg" | "mt" | "carton">("kg");
  const [currency, setCurrency] = useState("RMB");
  const [fxRate, setFxRate] = useState(7.24);
  const [cartons, setCartons] = useState(9700);
  const [containerType, setContainerType] = useState("1\u00d740'RH");
  const [addons, setAddons] = useState(DEFAULT_ADDONS);
  const [margin, setMargin] = useState(20);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const prods = getProducts();
    setProducts(prods);
    if (prods.length > 0) setSelectedId(prods[0].id);
    // Load saved settings
    try {
      const savedFx = localStorage.getItem(CALC_KEYS.fxRate);
      if (savedFx) setFxRate(parseFloat(savedFx));
      const savedAddons = localStorage.getItem(CALC_KEYS.addons);
      if (savedAddons) setAddons(JSON.parse(savedAddons));
      const savedMargin = localStorage.getItem(CALC_KEYS.margin);
      if (savedMargin) setMargin(parseFloat(savedMargin));
    } catch { /* ignore */ }
  }, []);

  const product = useMemo(() => products.find((p) => p.id === selectedId), [products, selectedId]);

  // When product changes, update defaults
  useEffect(() => {
    if (product) {
      setContainerType(product.containerType);
    }
  }, [product]);

  // Save settings on change
  useEffect(() => { try { localStorage.setItem(CALC_KEYS.fxRate, String(fxRate)); } catch {} }, [fxRate]);
  useEffect(() => { try { localStorage.setItem(CALC_KEYS.addons, JSON.stringify(addons)); } catch {} }, [addons]);
  useEffect(() => { try { localStorage.setItem(CALC_KEYS.margin, String(margin)); } catch {} }, [margin]);

  // Calculations
  const nw = product?.defaultNW ?? 0;
  const gw = product?.defaultGW ?? 0;
  const totalNW = nw * cartons;
  const totalGW = gw * cartons;
  const qtyMTS = totalNW / 1000;

  const rawPrice = parseFloat(priceInput) || 0;
  const supplierPerMT_local = priceUnit === "kg" ? rawPrice * 1000 : priceUnit === "carton" ? (nw > 0 ? (rawPrice / nw) * 1000 : 0) : rawPrice;
  const supplierPerMT_usd = currency === "USD" ? supplierPerMT_local : currency === "EUR" ? supplierPerMT_local * 1.08 : supplierPerMT_local / fxRate;
  const supplierTotal = supplierPerMT_usd * qtyMTS;
  const totalAddons = addons.reduce((s, a) => s + a.amount, 0);
  const landedCost = supplierTotal + totalAddons;
  const costPerMT = qtyMTS > 0 ? landedCost / qtyMTS : 0;
  const costPerCarton = cartons > 0 ? landedCost / cartons : 0;

  const sellPerMT = costPerMT / (1 - margin / 100);
  const sellPerCarton = cartons > 0 ? (sellPerMT * qtyMTS) / cartons : 0;
  const sellTotal = sellPerMT * qtyMTS;
  const profit = sellTotal - landedCost;

  // Margin scenarios
  const scenarios = [10, 15, 20, 25, 30].map((m) => {
    const spm = costPerMT / (1 - m / 100);
    return { margin: m, priceMT: spm, priceCarton: cartons > 0 ? (spm * qtyMTS) / cartons : 0, total: spm * qtyMTS };
  });

  // Price history comparison
  const priceComparisons = useMemo(() => {
    if (!product) return [];
    const history = getPriceHistory(product.name);
    const byBuyer: Record<string, { priceMT: number; date: string }> = {};
    for (const h of history) {
      if (!byBuyer[h.buyer]) byBuyer[h.buyer] = { priceMT: h.priceMT, date: h.date };
    }
    return Object.entries(byBuyer).slice(0, 5).map(([buyer, d]) => ({
      buyer,
      priceMT: d.priceMT,
      date: d.date,
      diff: sellPerMT > 0 ? ((sellPerMT - d.priceMT) / d.priceMT) * 100 : 0,
    }));
  }, [product, sellPerMT]);

  const handleCopy = useCallback(() => {
    if (!product) return;
    const text = `Quote: ${product.name}\nSize: ${nw}KG / Carton\nContainer: ${containerType} (${cartons.toLocaleString()} cartons)\nQuantity: ${qtyMTS.toFixed(2)} MTS\nPrice: ${fmtUSD0(sellPerMT)} per MT (negotiable)\nTotal: ${fmtUSD0(sellTotal)} USD\nValid for 7 days\n\n— TAFAKAH Food (Shanghai) Co., Ltd.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [product, nw, containerType, cartons, qtyMTS, sellPerMT, sellTotal]);

  const handleSaveDraft = useCallback(() => {
    if (!product) return;
    // Save draft data for Master page to pick up
    const draft = { product: product.name, nwPerCarton: nw, gwPerCarton: gw, cartons, pricePerMT: Math.round(sellPerMT * 100) / 100, containerType };
    localStorage.setItem("master-draft", JSON.stringify(draft));
    setToast("Draft saved. Open Master Data to continue.");
    setTimeout(() => setToast(null), 3000);
  }, [product, nw, gw, cartons, sellPerMT, containerType]);

  const updateAddon = useCallback((idx: number, amount: number) => {
    setAddons((prev) => prev.map((a, i) => i === idx ? { ...a, amount } : a));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      {toast && <div className="fixed top-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 shadow-lg">{toast}</div>}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ═══ LEFT: INPUTS ═══ */}
        <div className="space-y-6">
          {/* Product */}
          <Card>
            <CardHeader><CardTitle>Product</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Product</Label>
                <Select value={selectedId} onValueChange={(v) => v && setSelectedId(v)}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {product && (
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><span className="text-zinc-400">N.W.:</span> {product.defaultNW} KG</div>
                  <div><span className="text-zinc-400">G.W.:</span> {product.defaultGW} KG</div>
                  <div><span className="text-zinc-400">HS:</span> {product.hsCode}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Supplier Price */}
          <Card>
            <CardHeader><CardTitle>Supplier Price</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Unit</Label>
                  <Select value={priceUnit} onValueChange={(v) => v && setPriceUnit(v as "kg" | "mt" | "carton")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">Per KG</SelectItem>
                      <SelectItem value="mt">Per MT</SelectItem>
                      <SelectItem value="carton">Per Carton</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input type="number" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RMB">RMB</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {currency === "RMB" && (
                <div>
                  <Label>FX Rate (RMB/USD)</Label>
                  <Input type="number" step="0.01" value={fxRate} onChange={(e) => setFxRate(parseFloat(e.target.value) || 0)} />
                </div>
              )}
              {rawPrice > 0 && <p className="text-sm font-medium text-emerald-600">Converted: {fmtUSD(supplierPerMT_usd)} / MT</p>}
            </CardContent>
          </Card>

          {/* Container */}
          <Card>
            <CardHeader><CardTitle>Container</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={containerType} onValueChange={(v) => v && setContainerType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["1\u00d720'GP", "1\u00d740'GP", "1\u00d740'HC", "1\u00d740'RH", "1\u00d745'HC"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Cartons</Label><Input type="number" value={cartons} onChange={(e) => setCartons(parseInt(e.target.value) || 0)} /></div>
              <div className="col-span-2 grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-zinc-400">N.W.:</span> {totalNW.toLocaleString()} KG</div>
                <div><span className="text-zinc-400">G.W.:</span> {totalGW.toLocaleString()} KG</div>
                <div><span className="text-zinc-400">Qty:</span> {qtyMTS.toFixed(2)} MTS</div>
              </div>
            </CardContent>
          </Card>

          {/* Add-on Costs */}
          <Card>
            <CardHeader><CardTitle>Add-on Costs</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {addons.map((a, i) => (
                    <tr key={i} className="border-b border-zinc-100">
                      <td className="py-1.5 pr-2 text-zinc-600">{a.label}</td>
                      <td className="w-[120px] py-1">
                        <input type="number" value={a.amount || ""} onChange={(e) => updateAddon(i, parseFloat(e.target.value) || 0)} className="h-8 w-full rounded border border-zinc-200 bg-transparent px-2 text-right font-mono text-sm outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200" />
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="py-2">TOTAL ADD-ONS</td>
                    <td className="py-2 text-right font-mono">{fmtUSD(totalAddons)}</td>
                  </tr>
                </tbody>
              </table>
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
          {/* Cost Breakdown */}
          <Card className="border-2 border-emerald-200">
            <CardHeader><CardTitle>Cost Breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Supplier cost ({qtyMTS.toFixed(2)} MT \u00d7 {fmtUSD(supplierPerMT_usd)}):</span><span className="font-mono">{fmtUSD(supplierTotal)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Add-on costs:</span><span className="font-mono">{fmtUSD(totalAddons)}</span></div>
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
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy Quote"}
                </Button>
                <Button className="flex-1 gap-2" onClick={handleSaveDraft}>
                  <Save className="h-4 w-4" /> Save as Draft
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Margin Scenarios */}
          <Card>
            <CardHeader><CardTitle>Price Scenarios</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-zinc-400">
                    <th className="pb-2">Margin</th>
                    <th className="pb-2 text-right">Price/MT</th>
                    <th className="pb-2 text-right">$/Carton</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
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
                      <span className={c.diff > 0 ? "text-amber-600" : "text-emerald-600"}>
                        {c.diff > 0 ? "+" : ""}{c.diff.toFixed(0)}%
                      </span>
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
