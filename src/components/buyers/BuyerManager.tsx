"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
import { Plus, Pencil, Trash2, Search, X, Save, ChevronDown, ChevronUp, MessageCircle, Users } from "lucide-react";
import type { Buyer, BuyerLanguage, BuyerDocPreset } from "@/types/buyer";
import { BUYER_COUNTRIES, isValidE164 } from "@/types/buyer";
import { createEmptyBuyer } from "@/lib/buyers";
import { getContractLog } from "@/lib/contract-log";
import BuyerPortalAccess from "./BuyerPortalAccess";
import { useBuyers, useSaveBuyer, useDeleteBuyer } from "@/lib/data/buyers";

export default function BuyerManager() {
  const { data: buyersData, isLoading, isError, error, refetch } = useBuyers();
  const buyers = buyersData ?? [];
  const saveBuyerMut = useSaveBuyer();
  const deleteBuyerMut = useDeleteBuyer();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Buyer | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [msgExpanded, setMsgExpanded] = useState(false);
  const [msgLang, setMsgLang] = useState<BuyerLanguage>("en");
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!buyersData) return;
    const editId = searchParams?.get("edit");
    const focus = searchParams?.get("focus");
    if (editId) {
      const target = buyersData.find((b) => b.id === editId);
      if (target) {
        setEditing({ ...target });
        if (focus === "whatsapp") setMsgExpanded(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, !!buyersData]);

  const contractCounts = useMemo(() => {
    const log = getContractLog();
    const counts: Record<string, number> = {};
    for (const c of log) {
      const key = c.buyer.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, []);

  const filtered = useMemo(() => {
    if (!search) return buyers;
    const q = search.toLowerCase();
    return buyers.filter(
      (b) => b.company.toLowerCase().includes(q) || b.country.toLowerCase().includes(q) || b.email.toLowerCase().includes(q)
    );
  }, [buyers, search]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSave = useCallback(() => {
    if (!editing || !editing.company.trim()) return;
    const next = { ...editing, updatedAt: new Date().toISOString() };
    saveBuyerMut.mutate(next, {
      onSuccess: () => { setEditing(null); showToast("Buyer saved"); },
      onError: (e) => showToast(`Save failed: ${(e as Error).message}`),
    });
  }, [editing, saveBuyerMut, showToast]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this buyer?")) return;
    deleteBuyerMut.mutate(id, {
      onSuccess: () => showToast("Buyer deleted"),
      onError: (e) => showToast(`Delete failed: ${(e as Error).message}`),
    });
  }, [deleteBuyerMut, showToast]);

  if (isLoading) return <div className="flex items-center justify-center py-20 text-slate-500 font-medium">Loading database&hellip;</div>;
  if (isError) return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="mb-3 text-sm text-red-600">Failed to load buyers: {(error as Error).message}</p>
      <Button onClick={() => refetch()}>Retry</Button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-8">
      {toast && (
        <div className="fixed top-20 right-8 z-50 rounded-xl border border-emerald-200 bg-emerald-50/90 backdrop-blur-md px-6 py-4 text-sm font-semibold text-emerald-800 shadow-xl shadow-emerald-500/10 transition-all animate-in fade-in slide-in-from-top-4">
          {toast}
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Buyers Database</h2>
          <p className="text-slate-500 mt-1 text-sm font-medium">Manage your consignees, addresses, and document preferences.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyers..." className="pl-9 h-11 bg-white/50 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800 focus:ring-indigo-500/20 shadow-sm transition-all" />
          </div>
          <Button className="gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 font-bold px-6" onClick={() => setEditing(createEmptyBuyer())}>
            <Plus className="h-4 w-4" /> Add Buyer
          </Button>
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <Card className="bg-white dark:bg-zinc-900 border-2 border-indigo-200 dark:border-indigo-800 shadow-xl shadow-indigo-500/5 mb-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <CardHeader className="flex flex-row items-center justify-between bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-indigo-100 dark:border-indigo-800/50 pb-4 pt-5">
            <CardTitle className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><Users className="h-4 w-4" /></div>
              {buyers.some((b) => b.id === editing.id) ? "Edit Buyer" : "New Buyer"}
            </CardTitle>
            <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors bg-white dark:bg-zinc-800 hover:bg-slate-100 rounded-full p-1.5"><X className="h-5 w-5" /></button>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 p-6">
            <div className="sm:col-span-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Company Name *</Label>
              <Input value={editing.company} onChange={(e) => setEditing({ ...editing, company: e.target.value })} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Short Name / Code</Label>
              <Input value={editing.shortName} onChange={(e) => setEditing({ ...editing, shortName: e.target.value })} placeholder="e.g. TAFKAH" className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Address *</Label>
              <Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Additional Number</Label>
              <Input value={editing.additionalNumber} onChange={(e) => setEditing({ ...editing, additionalNumber: e.target.value })} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">City & Postal</Label>
              <Input value={editing.cityPostal} onChange={(e) => setEditing({ ...editing, cityPostal: e.target.value })} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Country</Label>
              <Select value={editing.country} onValueChange={(v) => v && setEditing({ ...editing, country: v })}>
                <SelectTrigger className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {BUYER_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Email *</Label>
              <Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">CC Email</Label>
              <Input type="email" value={editing.ccEmail} onChange={(e) => setEditing({ ...editing, ccEmail: e.target.value })} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Phone</Label>
              <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Contact Person</Label>
              <Input value={editing.contactPerson} onChange={(e) => setEditing({ ...editing, contactPerson: e.target.value })} className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Notes</Label>
              <Input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Internal notes..." className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10" />
            </div>

            {/* ═══ WhatsApp & Messaging ═══ */}
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="button"
                onClick={() => setMsgExpanded((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-zinc-800/50 px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-700/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366]/10 text-[#25D366]"><MessageCircle className="h-5 w-5" /></span> WhatsApp &amp; Messaging Settings
                  {editing.whatsappNumber && <span className="ml-2 font-mono text-slate-500">({editing.whatsappNumber})</span>}
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 shadow-sm">
                  {msgExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {msgExpanded && (
                <div className="mt-4 grid gap-6 rounded-xl border border-slate-200 dark:border-white/5 bg-white p-6 sm:grid-cols-2 dark:bg-zinc-900 shadow-sm animate-in slide-in-from-top-2">
                  <div className="sm:col-span-2">
                    <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">WhatsApp Number (E.164 format, no spaces)</Label>
                    <Input
                      value={editing.whatsappNumber ?? ""}
                      onChange={(e) => setEditing({ ...editing, whatsappNumber: e.target.value.trim() })}
                      placeholder="+966501234567"
                      className={`h-11 bg-white dark:bg-zinc-800 font-mono focus:ring-[#25D366]/20 ${
                        editing.whatsappNumber && !isValidE164(editing.whatsappNumber)
                          ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                          : "border-slate-200 dark:border-white/10"
                      }`}
                    />
                    <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {editing.whatsappNumber && !isValidE164(editing.whatsappNumber)
                        ? "Must start with + followed by 8-15 digits. No spaces or dashes."
                        : "Example: +966501234567 (Saudi Arabia)"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Preferred Language</Label>
                    <div className="mt-3 flex gap-6 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name={`buyerLang-${editing.id}`}
                          checked={(editing.preferredLanguage ?? "en") === "en"}
                          onChange={() => setEditing({ ...editing, preferredLanguage: "en" })}
                          className="h-4 w-4 accent-[#25D366]"
                        />
                        English
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name={`buyerLang-${editing.id}`}
                          checked={editing.preferredLanguage === "ar"}
                          onChange={() => setEditing({ ...editing, preferredLanguage: "ar" })}
                          className="h-4 w-4 accent-[#25D366]"
                        />
                        <span dir="rtl">&#x0627;&#x0644;&#x0639;&#x0631;&#x0628;&#x064A;&#x0629;</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Default Doc Preset</Label>
                    <Select
                      value={editing.defaultDocPreset ?? "buyer"}
                      onValueChange={(v) => v && setEditing({ ...editing, defaultDocPreset: v as BuyerDocPreset })}
                    >
                      <SelectTrigger className="h-11 bg-white dark:bg-zinc-800 font-medium focus:ring-indigo-500/20 border-slate-200 dark:border-white/10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buyer">For Buyer (SC + CI + PL)</SelectItem>
                        <SelectItem value="bank">For Bank (SC + CI)</SelectItem>
                        <SelectItem value="customs">For Customs (CI-Customs + PL)</SelectItem>
                        <SelectItem value="all">All 4 documents</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="mb-2 flex items-center gap-3">
                      <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 m-0 block">Custom Message Template (optional)</Label>
                      <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-100 p-0.5 text-xs dark:border-white/5 dark:bg-zinc-800">
                        <button
                          type="button"
                          onClick={() => setMsgLang("en")}
                          className={`rounded px-3 py-1 transition-all ${msgLang === "en" ? "bg-white font-bold text-indigo-600 shadow-sm dark:bg-zinc-700 dark:text-white" : "font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                        >EN</button>
                        <button
                          type="button"
                          onClick={() => setMsgLang("ar")}
                          className={`rounded px-3 py-1 transition-all ${msgLang === "ar" ? "bg-white font-bold text-indigo-600 shadow-sm dark:bg-zinc-700 dark:text-white" : "font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                        >AR</button>
                      </div>
                    </div>
                    <textarea
                      dir="auto"
                      rows={6}
                      value={(editing.customMessageTemplate ?? {})[msgLang] ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          customMessageTemplate: {
                            ...(editing.customMessageTemplate ?? {}),
                            [msgLang]: e.target.value,
                          },
                        })
                      }
                      placeholder={msgLang === "en"
                        ? "Leave empty to use the default template. Variables: {buyerName}, {contractNo}, {productList}, {totalQty}, {etd}, {docList}"
                        : "اتركه فارغاً لاستخدام القالب الافتراضي. المتغيرات: {buyerName}, {contractNo}, {productList}, {totalQty}, {etd}, {docList}"}
                      className="flex w-full rounded-xl border border-slate-200 bg-white/50 px-4 py-3 font-mono text-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950/50 transition-all shadow-inner"
                    />
                    <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Supports: <span className="font-mono text-indigo-600 dark:text-indigo-400 px-1 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded">{"{buyerName}"}</span>, <span className="font-mono text-indigo-600 dark:text-indigo-400 px-1 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded">{"{contractNo}"}</span>, <span className="font-mono text-indigo-600 dark:text-indigo-400 px-1 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded">{"{productList}"}</span>, <span className="font-mono text-indigo-600 dark:text-indigo-400 px-1 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded">{"{totalQty}"}</span>, <span className="font-mono text-indigo-600 dark:text-indigo-400 px-1 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded">{"{etd}"}</span>, <span className="font-mono text-indigo-600 dark:text-indigo-400 px-1 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded">{"{docList}"}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="sm:col-span-2 lg:col-span-3 mt-2">
              <BuyerPortalAccess
                localBuyerId={editing.id}
                buyerEmail={editing.email}
                buyerCompanyName={editing.company || "this buyer"}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3 mt-4 border-t border-slate-100 dark:border-white/5 pt-6 flex justify-end">
              <Button className="gap-2 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 shadow-md shadow-indigo-500/20" onClick={handleSave} disabled={!editing.company.trim() || (!!editing.whatsappNumber && !isValidE164(editing.whatsappNumber))}>
                <Save className="h-4 w-4" /> Save Buyer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="bg-white/70 dark:bg-zinc-900/70 border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        {buyers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400 mb-4"><Users className="h-6 w-6" /></div>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">No buyers yet</p>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6">Add your first buyer to start creating contracts.</p>
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700" onClick={() => setEditing(createEmptyBuyer())}><Plus className="h-4 w-4" /> Add Buyer</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 hover:bg-transparent">
                  <TableHead className="font-bold text-slate-700 dark:text-slate-300">Company Name</TableHead>
                  <TableHead className="font-bold text-slate-700 dark:text-slate-300">Country</TableHead>
                  <TableHead className="font-bold text-slate-700 dark:text-slate-300">Email</TableHead>
                  <TableHead className="text-center font-bold text-slate-700 dark:text-slate-300">Contracts</TableHead>
                  <TableHead className="w-[100px] text-right font-bold text-slate-700 dark:text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-4">{b.company}{b.shortName && <span className="ml-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-500/20">{b.shortName}</span>}</TableCell>
                    <TableCell className="font-medium text-slate-600 dark:text-slate-300">{b.country || "—"}</TableCell>
                    <TableCell className="text-sm font-medium text-slate-500 dark:text-slate-400">{b.email || "—"}</TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/10">{contractCounts[b.company.toLowerCase()] ?? 0}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing({ ...b })} title="Edit" className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)} title="Delete" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
