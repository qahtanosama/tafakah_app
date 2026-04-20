"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Plus, Trash2, ArrowLeft, DollarSign, TrendingUp, CreditCard } from "lucide-react";
import type { ContractLogEntry } from "@/types/sales-contract";
import type { ContractFinance, CostItem, PaymentItem, CostCategory, PaymentMethod } from "@/types/finance";
import { COST_CATEGORIES, PAYMENT_METHODS } from "@/types/finance";
import { getContractLog } from "@/lib/contract-log";
import { calcTotals } from "@/lib/sales-contract";
import { getFinance, saveFinance, createEmptyFinance, calcSummary } from "@/lib/finance";

function fmtUSD(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ContractFinanceDetail({ contractNo }: { contractNo: string }) {
  const [contract, setContract] = useState<ContractLogEntry | null>(null);
  const [finance, setFinance] = useState<ContractFinance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newCost, setNewCost] = useState<Partial<CostItem>>({});
  const [newPayment, setNewPayment] = useState<Partial<PaymentItem>>({});
  const [showCostForm, setShowCostForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  useEffect(() => {
    const log = getContractLog();
    const c = log.find((e) => e.contractNo === contractNo);
    setContract(c ?? null);
    setFinance(getFinance(contractNo) ?? createEmptyFinance(contractNo));
    setLoaded(true);
  }, [contractNo]);

  const totals = useMemo(() => contract ? calcTotals(contract.masterSnapshot.lineItems) : null, [contract]);
  const revenue = totals?.totalUSD ?? 0;
  const summary = useMemo(() => calcSummary(revenue, finance), [revenue, finance]);

  const reload = useCallback(() => setFinance(getFinance(contractNo) ?? createEmptyFinance(contractNo)), [contractNo]);

  const handleAddCost = useCallback(() => {
    if (!newCost.category || !newCost.amount) return;
    const cost: CostItem = {
      id: crypto.randomUUID(),
      category: newCost.category as CostCategory,
      description: newCost.description ?? "",
      amount: newCost.amount,
      date: newCost.date ?? new Date().toISOString().split("T")[0],
      notes: newCost.notes ?? "",
    };
    const f = finance ?? createEmptyFinance(contractNo);
    f.costs.push(cost);
    saveFinance(f);
    reload();
    setNewCost({});
    setShowCostForm(false);
  }, [newCost, finance, contractNo, reload]);

  const handleDeleteCost = useCallback((id: string) => {
    if (!finance) return;
    finance.costs = finance.costs.filter((c) => c.id !== id);
    saveFinance(finance);
    reload();
  }, [finance, reload]);

  const handleAddPayment = useCallback(() => {
    if (!newPayment.amount) return;
    const payment: PaymentItem = {
      id: crypto.randomUUID(),
      date: newPayment.date ?? new Date().toISOString().split("T")[0],
      amount: newPayment.amount,
      method: (newPayment.method as PaymentMethod) ?? "T/T Advance",
      reference: newPayment.reference ?? "",
      notes: newPayment.notes ?? "",
    };
    const f = finance ?? createEmptyFinance(contractNo);
    f.payments.push(payment);
    saveFinance(f);
    reload();
    setNewPayment({});
    setShowPaymentForm(false);
  }, [newPayment, finance, contractNo, reload]);

  const handleDeletePayment = useCallback((id: string) => {
    if (!finance) return;
    finance.payments = finance.payments.filter((p) => p.id !== id);
    saveFinance(finance);
    reload();
  }, [finance, reload]);

  if (!loaded) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;
  if (!contract) return <div className="py-20 text-center text-zinc-400">Contract not found.</div>;

  const statusColor = summary.paymentStatus === "paid" ? "text-emerald-600" : summary.paymentStatus === "partial" ? "text-amber-600" : summary.paymentStatus === "overpaid" ? "text-blue-600" : "text-zinc-400";
  const statusLabel = summary.paymentStatus === "paid" ? "Fully Paid" : summary.paymentStatus === "partial" ? "Partial" : summary.paymentStatus === "overpaid" ? "Overpaid" : "Unpaid";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/finance" className="text-zinc-400 hover:text-zinc-600"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold">{contractNo}</h1>
          <p className="text-base text-zinc-500">{contract.buyer} &middot; {fmtDate(contract.dateSubmitted)} &middot; {fmtUSD(revenue)}</p>
        </div>
      </div>

      {/* Profit summary */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Revenue", value: fmtUSD(summary.revenue), icon: DollarSign, color: "text-zinc-700" },
          { label: "Total Cost", value: fmtUSD(summary.totalCost), icon: DollarSign, color: "text-red-600" },
          { label: "Gross Profit", value: fmtUSD(summary.grossProfit), icon: TrendingUp, color: summary.grossProfit >= 0 ? "text-emerald-600" : "text-red-600" },
          { label: "Margin", value: summary.margin.toFixed(1) + "%", icon: TrendingUp, color: summary.margin >= 15 ? "text-emerald-600" : "text-amber-600" },
          { label: "Received", value: fmtUSD(summary.totalReceived), icon: CreditCard, color: "text-blue-600" },
          { label: "Status", value: statusLabel, icon: CreditCard, color: statusColor },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-4 dark:bg-zinc-900">
            <p className="text-xs text-zinc-400">{s.label}</p>
            <p className={`mt-1 text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ═══ COSTS ═══ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Costs</CardTitle>
          <Button size="sm" className="gap-1" onClick={() => setShowCostForm(true)}><Plus className="h-4 w-4" /> Add Cost</Button>
        </CardHeader>
        <CardContent>
          {showCostForm && (
            <div className="mb-4 grid gap-3 rounded-lg border bg-zinc-50 p-4 sm:grid-cols-4 dark:bg-zinc-800">
              <div>
                <Label>Category</Label>
                <Select value={newCost.category ?? ""} onValueChange={(v) => v && setNewCost((p) => ({ ...p, category: v as CostCategory }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{COST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Description</Label><Input value={newCost.description ?? ""} onChange={(e) => setNewCost((p) => ({ ...p, description: e.target.value }))} /></div>
              <div><Label>Amount ($)</Label><Input type="number" value={newCost.amount ?? ""} onChange={(e) => setNewCost((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>Date</Label><Input type="date" value={newCost.date ?? ""} onChange={(e) => setNewCost((p) => ({ ...p, date: e.target.value }))} /></div>
              <div className="sm:col-span-4 flex gap-2">
                <Button size="sm" onClick={handleAddCost} disabled={!newCost.category || !newCost.amount}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setShowCostForm(false); setNewCost({}); }}>Cancel</Button>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(finance?.costs ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.category}</TableCell>
                  <TableCell className="text-sm">{c.description || "\u2014"}</TableCell>
                  <TableCell className="text-right font-mono">{fmtUSD(c.amount)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(c.date)}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => handleDeleteCost(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                </TableRow>
              ))}
              {(finance?.costs ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-zinc-400">No costs added yet</TableCell></TableRow>
              )}
              <TableRow className="bg-zinc-50 font-bold dark:bg-zinc-800">
                <TableCell colSpan={2}>TOTAL COST</TableCell>
                <TableCell className="text-right font-mono">{fmtUSD(summary.totalCost)}</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>
            </TableBody>
          </Table>
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
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(finance?.payments ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{fmtDate(p.date)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtUSD(p.amount)}</TableCell>
                  <TableCell>{p.method}</TableCell>
                  <TableCell className="text-sm">{p.reference || "\u2014"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                </TableRow>
              ))}
              {(finance?.payments ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-zinc-400">No payments recorded yet</TableCell></TableRow>
              )}
              <TableRow className="bg-zinc-50 font-bold dark:bg-zinc-800">
                <TableCell>TOTAL RECEIVED</TableCell>
                <TableCell className="text-right font-mono">{fmtUSD(summary.totalReceived)}</TableCell>
                <TableCell colSpan={3}>
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
