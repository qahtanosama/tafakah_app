"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, X, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import type { SalesContractData } from "@/types/sales-contract";
import type { ContractFinance, CostItem, PaymentItem, PaymentMethod, CostCurrency } from "@/types/finance";
import { PAYMENT_METHODS } from "@/types/finance";
import { calcTotals } from "@/lib/sales-contract";
import { getFinance, createEmptyFinance, ensurePredefinedRows, calcSummary, costToUSD, isValidRmbRate, rmbRateWarning } from "@/lib/finance";
import { backfillPaymentIds } from "@/lib/finance/backfill-payment-ids";
import { isFobIncoterm, freightBilledTotal } from "@/lib/shipping";
import { useContractByNo } from "@/lib/data/contracts";
import { useShipping } from "@/lib/data/shipping";
import { useFinance, useSaveFinance } from "@/lib/data/finance";
import PaymentReceipts from "@/components/finance/PaymentReceipts";

function fmtUSD(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Spreadsheet cost row ──────────────────────────── */
function CostRow({
  cost, index, rate, onUpdate, onDelete, showSavedId,
}: {
  cost: CostItem;
  index: number;
  rate: number | null;
  onUpdate: (updated: CostItem) => void;
  onDelete?: () => void;
  showSavedId: string | null;
}) {
  const [desc, setDesc] = useState(cost.description);
  const [amount, setAmount] = useState(cost.amount > 0 ? String(cost.amount) : "");
  const [date, setDate] = useState(cost.date);
  const [focused, setFocused] = useState(false);

  const currency: CostCurrency = cost.currency ?? "USD";

  // Sync from parent when cost changes (e.g., after reload)
  useEffect(() => {
    setDesc(cost.description);
    setAmount(cost.amount > 0 ? String(cost.amount) : "");
    setDate(cost.date);
  }, [cost.description, cost.amount, cost.date]);

  const flush = useCallback(() => {
    const amt = parseFloat(amount) || 0;
    const d = amt > 0 && !date ? new Date().toISOString().split("T")[0] : date;
    if (desc !== cost.description || amt !== cost.amount || d !== cost.date) {
      onUpdate({ ...cost, description: desc, amount: amt, date: d });
    }
  }, [desc, amount, date, cost, onUpdate]);

  // Changing currency commits any in-progress edits in the same write so they
  // aren't lost (mirrors the inline category edit pattern).
  const setCurrency = useCallback((cur: CostCurrency) => {
    const amt = parseFloat(amount) || 0;
    onUpdate({ ...cost, description: desc, amount: amt, date, currency: cur });
  }, [amount, desc, date, cost, onUpdate]);

  const even = index % 2 === 0;
  const saved = showSavedId === cost.id;
  const amt = parseFloat(amount) || 0;
  const usdEquiv = costToUSD({ ...cost, amount: amt, currency }, rate);

  return (
    <tr className={`border-b border-zinc-100 transition-colors ${focused ? "bg-blue-50/50 dark:bg-blue-950/20" : even ? "bg-white dark:bg-zinc-900" : "bg-zinc-50/50 dark:bg-zinc-800/30"}`}>
      <td className="w-[200px] px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {cost.isPredefined ? (
          cost.category
        ) : (
          <input
            value={cost.category}
            onChange={(e) => onUpdate({ ...cost, category: e.target.value })}
            className="w-full bg-transparent text-sm font-medium outline-none"
            placeholder="Category name"
          />
        )}
      </td>
      <td className="px-2 py-1">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={flush}
          onFocus={() => setFocused(true)}
          onBlurCapture={() => setFocused(false)}
          className="h-9 w-full rounded border-transparent bg-transparent px-2 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-1 focus:ring-blue-200 dark:focus:bg-zinc-800"
          placeholder="Description"
        />
      </td>
      <td className="w-[88px] px-2 py-1">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as CostCurrency)}
          className="h-9 w-full rounded border border-transparent bg-transparent px-1 text-sm outline-none transition-colors hover:border-zinc-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-200 dark:hover:border-zinc-700 dark:focus:bg-zinc-800"
          aria-label="Currency"
        >
          <option value="USD">$ USD</option>
          <option value="RMB">¥ RMB</option>
        </select>
      </td>
      <td className="w-[150px] px-2 py-1">
        <div className="flex items-center justify-end gap-1">
          <span className="font-mono text-sm text-zinc-400">{currency === "RMB" ? "¥" : "$"}</span>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={flush}
            onFocus={() => setFocused(true)}
            onBlurCapture={() => setFocused(false)}
            className="h-9 w-full rounded border-transparent bg-transparent px-2 text-right font-mono text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-1 focus:ring-blue-200 dark:focus:bg-zinc-800"
            placeholder="—"
          />
        </div>
        {currency === "RMB" && amt > 0 && (
          <p className="px-2 text-right text-[11px] text-zinc-400">
            {isValidRmbRate(rate) ? `≈ ${fmtUSD(usdEquiv)}` : <span className="text-amber-600">set rate</span>}
          </p>
        )}
      </td>
      <td className="w-[140px] px-2 py-1">
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); }}
          onBlur={flush}
          onFocus={() => setFocused(true)}
          onBlurCapture={() => setFocused(false)}
          className="h-9 w-full rounded border-transparent bg-transparent px-2 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-1 focus:ring-blue-200 dark:focus:bg-zinc-800"
        />
      </td>
      <td className="w-[44px] px-1 py-1 text-center">
        {saved && <Check className="mx-auto h-4 w-4 text-emerald-500 animate-in fade-in" />}
        {!saved && !cost.isPredefined && onDelete && (
          <button onClick={onDelete} className="text-zinc-300 hover:text-red-500"><X className="h-4 w-4" /></button>
        )}
      </td>
    </tr>
  );
}

/* ── Main component ────────────────────────────────── */
export default function ContractFinanceDetail({ contractNo }: { contractNo: string }) {
  const contractQuery = useContractByNo(contractNo);
  const contractRow = contractQuery.data;
  const contractId = contractRow?.id ?? null;
  const { data: financeRow, isLoading: financeLoading } = useFinance(contractId ?? undefined);
  const { data: shippingRow } = useShipping(contractId ?? undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveFinanceMut = useSaveFinance(contractId ?? "", (msg) => setSaveError(msg));

  const [finance, setFinance] = useState<ContractFinance | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [newPayment, setNewPayment] = useState<Partial<PaymentItem>>({});
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initedRef = useRef<string | null>(null);

  const snapshot: SalesContractData | null = contractRow?.master_snapshot ?? null;
  const buyer = contractRow?.master_snapshot?.buyer?.company?.trim() || "—";
  const dateSubmitted = contractRow?.created_at ?? "";

  // Initialize the editable finance state once, preferring the Supabase row.
  useEffect(() => {
    if (contractQuery.isLoading) return;
    if (contractId && financeLoading) return; // wait for finance fetch
    if (initedRef.current === contractNo) return;
    initedRef.current = contractNo;

    let f: ContractFinance;
    if (financeRow) {
      f = { contractNo, costs: financeRow.cost_items ?? [], payments: financeRow.payments_received ?? [], rmbUsdRate: financeRow.rmb_usd_rate ?? null, updatedAt: financeRow.updated_at ?? "" };
    } else {
      f = getFinance(contractNo) ?? createEmptyFinance(contractNo);
    }
    f = ensurePredefinedRows(f);
    const { changed, record } = backfillPaymentIds(f);
    if (changed) f = record;
    setFinance(f);
  }, [contractNo, contractId, contractQuery.isLoading, financeLoading, financeRow]);

  const totals = useMemo(() => snapshot ? calcTotals(snapshot.lineItems, snapshot.terms?.numberOfContainers) : null, [snapshot]);
  const goodsRevenue = totals?.totalUSD ?? 0;
  // FOB only: the buyer is billed sea freight, so it counts as revenue. Same
  // contract_shipping value the Freight Invoice uses; 0 for CIF/CFR.
  const freightRevenue = isFobIncoterm(snapshot?.shipping?.incoterm)
    ? freightBilledTotal(shippingRow?.freight_base, shippingRow?.freight_additional)
    : 0;
  const summary = useMemo(() => calcSummary(goodsRevenue, finance, freightRevenue), [goodsRevenue, finance, freightRevenue]);

  const flashSaved = useCallback((id: string) => {
    setSavedId(id);
    if (savedTimeout.current) clearTimeout(savedTimeout.current);
    savedTimeout.current = setTimeout(() => setSavedId(null), 1200);
  }, []);

  /** Single write funnel: optimistic state + Supabase (source of truth). */
  const persist = useCallback((next: ContractFinance) => {
    setFinance(next);
    if (contractId) {
      setSaveError(null); // clear any prior failure; onError re-sets it if this one fails too
      saveFinanceMut.mutate({ costs: next.costs, payments: next.payments, rmbUsdRate: next.rmbUsdRate ?? null });
    }
  }, [contractId, saveFinanceMut]);

  // RMB→USD rate (¥ per $1) — local input string committed on blur.
  const [rateStr, setRateStr] = useState("");
  useEffect(() => {
    setRateStr(finance?.rmbUsdRate != null ? String(finance.rmbUsdRate) : "");
  }, [finance?.rmbUsdRate]);
  const liveRate = rateStr.trim() === "" ? null : parseFloat(rateStr);
  const rateWarn = rmbRateWarning(liveRate);
  const hasRmbCosts = !!finance?.costs.some((c) => (c.currency ?? "USD") === "RMB" && c.amount > 0);
  const rateOk = isValidRmbRate(finance?.rmbUsdRate);

  const commitRate = useCallback(() => {
    if (!finance) return;
    const v = rateStr.trim() === "" ? null : parseFloat(rateStr);
    const next = typeof v === "number" && isFinite(v) && v > 0 ? v : null;
    if ((finance.rmbUsdRate ?? null) !== next) persist({ ...finance, rmbUsdRate: next });
  }, [finance, rateStr, persist]);

  const handleCostUpdate = useCallback((updated: CostItem) => {
    if (!finance) return;
    persist({ ...finance, costs: finance.costs.map((c) => c.id === updated.id ? updated : c) });
    flashSaved(updated.id);
  }, [finance, flashSaved, persist]);

  const handleAddCustom = useCallback(() => {
    if (!finance) return;
    const custom: CostItem = {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      category: "",
      isPredefined: false,
      description: "",
      amount: 0,
      date: "",
      notes: "",
    };
    persist({ ...finance, costs: [...finance.costs, custom] });
  }, [finance, persist]);

  const handleDeleteCustom = useCallback((id: string) => {
    if (!finance) return;
    persist({ ...finance, costs: finance.costs.filter((c) => c.id !== id) });
  }, [finance, persist]);

  // Payments
  const handleAddPayment = useCallback(() => {
    if (!newPayment.amount || !finance) return;
    const payment: PaymentItem = {
      id: crypto.randomUUID(),
      date: newPayment.date ?? new Date().toISOString().split("T")[0],
      amount: newPayment.amount,
      method: (newPayment.method as PaymentMethod) ?? "T/T Advance",
      reference: newPayment.reference ?? "",
      notes: newPayment.notes ?? "",
    };
    persist({ ...finance, payments: [...finance.payments, payment] });
    setNewPayment({});
    setShowPaymentForm(false);
  }, [newPayment, finance, persist]);

  const handleDeletePayment = useCallback((id: string) => {
    if (!finance) return;
    persist({ ...finance, payments: finance.payments.filter((p) => p.id !== id) });
  }, [finance, persist]);

  if (contractQuery.isLoading || !finance) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;
  if (!snapshot) return <div className="py-20 text-center text-zinc-400">Contract not found.</div>;

  const statusColor = summary.paymentStatus === "paid" ? "text-emerald-600" : summary.paymentStatus === "partial" ? "text-amber-600" : summary.paymentStatus === "overpaid" ? "text-blue-600" : "text-zinc-400";
  const statusLabel = summary.paymentStatus === "paid" ? "Fully Paid" : summary.paymentStatus === "partial" ? "Partial" : summary.paymentStatus === "overpaid" ? "Overpaid" : "Unpaid";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/finance" className="text-zinc-400 hover:text-zinc-600"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold">{contractNo}</h1>
          <p className="text-base text-zinc-500">{buyer} &middot; {fmtDate(dateSubmitted)} &middot; {fmtUSD(summary.revenue)}</p>
        </div>
      </div>

      {/* Save-failure banner — finance saves auto-fire on blur, so surface any failure. */}
      {saveError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Couldn&rsquo;t save your changes.</span> {saveError}
            <span className="block text-xs opacity-80">Your most recent edit was not persisted. Fix the issue and re-enter it.</span>
          </div>
        </div>
      )}

      {/* Summary cards. On FOB, freight billed to the buyer is shown as its own
          revenue line alongside goods (header above shows the combined total). */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ...(summary.freightRevenue > 0
            ? [
                { label: "Goods Revenue", value: fmtUSD(summary.goodsRevenue), color: "text-zinc-700" },
                { label: "Sea Freight (billed)", value: fmtUSD(summary.freightRevenue), color: "text-zinc-700" },
              ]
            : [{ label: "Revenue", value: fmtUSD(summary.revenue), color: "text-zinc-700" }]),
          { label: "Total Cost", value: fmtUSD(summary.totalCost), color: "text-red-600" },
          { label: "Gross Profit", value: fmtUSD(summary.grossProfit), color: summary.grossProfit >= 0 ? "text-emerald-600" : "text-red-600" },
          { label: "Margin", value: summary.margin.toFixed(1) + "%", color: summary.margin >= 15 ? "text-emerald-600" : "text-amber-600" },
          { label: "Received", value: fmtUSD(summary.totalReceived), color: "text-blue-600" },
          { label: "Status", value: statusLabel, color: statusColor },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-4 dark:bg-zinc-900">
            <p className="text-xs text-zinc-400">{s.label}</p>
            <p className={`mt-1 text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ═══ COSTS — Spreadsheet Grid ═══ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Costs</CardTitle>
          {/* Per-contract RMB→USD rate (¥ per $1). */}
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <Label htmlFor="rmb-rate" className="text-xs text-zinc-500">RMB → USD rate (¥ per $1)</Label>
              <Input
                id="rmb-rate"
                type="number"
                step="0.0001"
                inputMode="decimal"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                onBlur={commitRate}
                placeholder="e.g. 7.2"
                className="h-9 w-28 text-right font-mono"
              />
            </div>
            {rateWarn && <p className="mt-1 text-right text-[11px] text-amber-600">{rateWarn}</p>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {hasRmbCosts && !rateOk && (
            <div className="mx-4 mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              This contract has RMB costs but no valid rate yet — they count as $0 in the totals until you set the RMB → USD rate above.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-100/50 text-left text-xs font-semibold text-zinc-500 dark:bg-zinc-800/50">
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="w-[44px] px-1 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(finance?.costs ?? []).map((cost, i) => (
                  <CostRow
                    key={cost.id}
                    cost={cost}
                    index={i}
                    rate={finance?.rmbUsdRate ?? null}
                    onUpdate={handleCostUpdate}
                    onDelete={cost.isPredefined ? undefined : () => handleDeleteCustom(cost.id)}
                    showSavedId={savedId}
                  />
                ))}
                {/* Add custom row */}
                <tr className="border-b border-zinc-100">
                  <td colSpan={6} className="px-3 py-2">
                    <button onClick={handleAddCustom} className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700">
                      <Plus className="h-4 w-4" /> Add Custom Item
                    </button>
                  </td>
                </tr>
                {/* Total */}
                <tr className="bg-zinc-100 font-bold dark:bg-zinc-800">
                  <td colSpan={3} className="px-3 py-3 text-base">TOTAL COST (USD)</td>
                  <td className="px-3 py-3 text-right font-mono text-base">{fmtUSD(summary.totalCost)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ═══ PAYMENTS ═══ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Payments</CardTitle>
          <Button size="sm" className="gap-1" onClick={() => setShowPaymentForm(true)}><Plus className="h-4 w-4" /> Add Payment</Button>
        </CardHeader>
        <CardContent>
          {showPaymentForm && (
            <div className="mb-4 grid gap-3 rounded-lg border bg-zinc-50 p-4 sm:grid-cols-4 dark:bg-zinc-800">
              <div><Label>Amount ($)</Label><Input type="number" value={newPayment.amount ?? ""} onChange={(e) => setNewPayment((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} /></div>
              <div>
                <Label>Method</Label>
                <Select value={newPayment.method ?? "T/T Advance"} onValueChange={(v) => v && setNewPayment((p) => ({ ...p, method: v as PaymentMethod }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Reference</Label><Input value={newPayment.reference ?? ""} onChange={(e) => setNewPayment((p) => ({ ...p, reference: e.target.value }))} placeholder="TT ref, LC no..." /></div>
              <div><Label>Date</Label><Input type="date" value={newPayment.date ?? ""} onChange={(e) => setNewPayment((p) => ({ ...p, date: e.target.value }))} /></div>
              <div className="sm:col-span-4 flex gap-2">
                <Button size="sm" onClick={handleAddPayment} disabled={!newPayment.amount}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setShowPaymentForm(false); setNewPayment({}); }}>Cancel</Button>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Receipts</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(finance?.payments ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{fmtDate(p.date)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtUSD(p.amount)}</TableCell>
                  <TableCell>{p.method}</TableCell>
                  <TableCell className="text-sm">{p.reference || "—"}</TableCell>
                  <TableCell>
                    {contractQuery.isLoading ? (
                      <span className="text-[11px] text-zinc-400">Loading…</span>
                    ) : contractId ? (
                      <PaymentReceipts contractId={contractId} paymentId={p.id} isClient={false} />
                    ) : (
                      <span className="text-[11px] text-zinc-400">Not synced to cloud</span>
                    )}
                  </TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                </TableRow>
              ))}
              {(finance?.payments ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-zinc-400">No payments recorded yet</TableCell></TableRow>
              )}
              <TableRow className="bg-zinc-50 font-bold dark:bg-zinc-800">
                <TableCell>TOTAL RECEIVED</TableCell>
                <TableCell className="text-right font-mono">{fmtUSD(summary.totalReceived)}</TableCell>
                <TableCell colSpan={4}>
                  <span className={summary.outstanding > 1 ? "text-amber-600" : "text-emerald-600"}>
                    Outstanding: {fmtUSD(Math.max(0, summary.outstanding))}
                  </span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
