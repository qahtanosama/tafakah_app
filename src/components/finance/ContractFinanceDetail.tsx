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
import { Plus, Trash2, X, ArrowLeft, Check } from "lucide-react";
import type { SalesContractData } from "@/types/sales-contract";
import type { ContractFinance, CostItem, PaymentItem, PaymentMethod } from "@/types/finance";
import { PAYMENT_METHODS } from "@/types/finance";
import { calcTotals } from "@/lib/sales-contract";
import { getFinance, createEmptyFinance, ensurePredefinedRows, calcSummary } from "@/lib/finance";
import { backfillPaymentIds } from "@/lib/finance/backfill-payment-ids";
import { useContractByNo } from "@/lib/data/contracts";
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
  cost, index, onUpdate, onDelete, showSavedId,
}: {
  cost: CostItem;
  index: number;
  onUpdate: (updated: CostItem) => void;
  onDelete?: () => void;
  showSavedId: string | null;
}) {
  const [desc, setDesc] = useState(cost.description);
  const [amount, setAmount] = useState(cost.amount > 0 ? String(cost.amount) : "");
  const [date, setDate] = useState(cost.date);
  const [focused, setFocused] = useState(false);

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

  const even = index % 2 === 0;
  const saved = showSavedId === cost.id;

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
      <td className="w-[140px] px-2 py-1">
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
  const saveFinanceMut = useSaveFinance(contractId ?? "");

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
      f = { contractNo, costs: financeRow.cost_items ?? [], payments: financeRow.payments_received ?? [], updatedAt: financeRow.updated_at ?? "" };
    } else {
      f = getFinance(contractNo) ?? createEmptyFinance(contractNo);
    }
    f = ensurePredefinedRows(f);
    const { changed, record } = backfillPaymentIds(f);
    if (changed) f = record;
    setFinance(f);
  }, [contractNo, contractId, contractQuery.isLoading, financeLoading, financeRow]);

  const totals = useMemo(() => snapshot ? calcTotals(snapshot.lineItems, snapshot.terms?.numberOfContainers) : null, [snapshot]);
  const revenue = totals?.totalUSD ?? 0;
  const summary = useMemo(() => calcSummary(revenue, finance), [revenue, finance]);

  const flashSaved = useCallback((id: string) => {
    setSavedId(id);
    if (savedTimeout.current) clearTimeout(savedTimeout.current);
    savedTimeout.current = setTimeout(() => setSavedId(null), 1200);
  }, []);

  /** Single write funnel: optimistic state + Supabase (source of truth). */
  const persist = useCallback((next: ContractFinance) => {
    setFinance(next);
    if (contractId) {
      saveFinanceMut.mutate({ costs: next.costs, payments: next.payments });
    }
  }, [contractId, saveFinanceMut]);

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
          <p className="text-base text-zinc-500">{buyer} &middot; {fmtDate(dateSubmitted)} &middot; {fmtUSD(revenue)}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Revenue", value: fmtUSD(summary.revenue), color: "text-zinc-700" },
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
        <CardHeader>
          <CardTitle>Costs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-100/50 text-left text-xs font-semibold text-zinc-500 dark:bg-zinc-800/50">
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Amount (USD)</th>
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
                    onUpdate={handleCostUpdate}
                    onDelete={cost.isPredefined ? undefined : () => handleDeleteCustom(cost.id)}
                    showSavedId={savedId}
                  />
                ))}
                {/* Add custom row */}
                <tr className="border-b border-zinc-100">
                  <td colSpan={5} className="px-3 py-2">
                    <button onClick={handleAddCustom} className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700">
                      <Plus className="h-4 w-4" /> Add Custom Item
                    </button>
                  </td>
                </tr>
                {/* Total */}
                <tr className="bg-zinc-100 font-bold dark:bg-zinc-800">
                  <td colSpan={2} className="px-3 py-3 text-base">TOTAL COST</td>
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
