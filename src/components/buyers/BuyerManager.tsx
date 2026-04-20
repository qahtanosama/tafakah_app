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
import { Plus, Pencil, Trash2, Search, X, Save, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import type { Buyer, BuyerLanguage, BuyerDocPreset } from "@/types/buyer";
import { BUYER_COUNTRIES, isValidE164 } from "@/types/buyer";
import { getBuyers, addBuyer, updateBuyer, deleteBuyer, createEmptyBuyer } from "@/lib/buyers";
import { getContractLog } from "@/lib/contract-log";

export default function BuyerManager() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Buyer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [msgExpanded, setMsgExpanded] = useState(false);
  const [msgLang, setMsgLang] = useState<BuyerLanguage>("en");
  const searchParams = useSearchParams();

  useEffect(() => {
    const all = getBuyers();
    setBuyers(all);
    setLoaded(true);

    const editId = searchParams?.get("edit");
    const focus = searchParams?.get("focus");
    if (editId) {
      const target = all.find((b) => b.id === editId);
      if (target) {
        setEditing({ ...target });
        if (focus === "whatsapp") setMsgExpanded(true);
      }
    }
  }, [searchParams]);

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
    editing.updatedAt = new Date().toISOString();
    if (buyers.some((b) => b.id === editing.id)) {
      updateBuyer(editing);
    } else {
      addBuyer(editing);
    }
    setBuyers(getBuyers());
    setEditing(null);
    showToast("Buyer saved");
  }, [editing, buyers, showToast]);

  const handleDelete = useCallback((id: string) => {
    deleteBuyer(id);
    setBuyers(getBuyers());
    showToast("Buyer deleted");
  }, [showToast]);

  if (!loaded) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {toast}
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyers..." className="pl-9" />
        </div>
        <Button className="gap-2" onClick={() => setEditing(createEmptyBuyer())}>
          <Plus className="h-4 w-4" /> Add Buyer
        </Button>
      </div>

      {/* Editor */}
      {editing && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{buyers.some((b) => b.id === editing.id) ? "Edit Buyer" : "New Buyer"}</CardTitle>
            <button onClick={() => setEditing(null)} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>Company Name *</Label>
              <Input value={editing.company} onChange={(e) => setEditing({ ...editing, company: e.target.value })} />
            </div>
            <div>
              <Label>Short Name / Code</Label>
              <Input value={editing.shortName} onChange={(e) => setEditing({ ...editing, shortName: e.target.value })} placeholder="e.g. TAFKAH" />
            </div>
            <div className="sm:col-span-2">
              <Label>Address *</Label>
              <Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            </div>
            <div>
              <Label>Additional Number</Label>
              <Input value={editing.additionalNumber} onChange={(e) => setEditing({ ...editing, additionalNumber: e.target.value })} />
            </div>
            <div>
              <Label>City & Postal</Label>
              <Input value={editing.cityPostal} onChange={(e) => setEditing({ ...editing, cityPostal: e.target.value })} />
            </div>
            <div>
              <Label>Country</Label>
              <Select value={editing.country} onValueChange={(v) => v && setEditing({ ...editing, country: v })}>
                <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {BUYER_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </div>
            <div>
              <Label>CC Email</Label>
              <Input type="email" value={editing.ccEmail} onChange={(e) => setEditing({ ...editing, ccEmail: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input value={editing.contactPerson} onChange={(e) => setEditing({ ...editing, contactPerson: e.target.value })} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Notes</Label>
              <Input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Internal notes..." />
            </div>

            {/* ═══ WhatsApp & Messaging ═══ */}
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="button"
                onClick={() => setMsgExpanded((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border bg-zinc-50 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <span className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp &amp; Messaging
                  {editing.whatsappNumber && <span className="ml-2 text-xs text-zinc-400">({editing.whatsappNumber})</span>}
                </span>
                {msgExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {msgExpanded && (
                <div className="mt-3 grid gap-4 rounded-lg border bg-white p-4 sm:grid-cols-2 dark:bg-zinc-900">
                  <div className="sm:col-span-2">
                    <Label>WhatsApp Number (E.164 format, no spaces)</Label>
                    <Input
                      value={editing.whatsappNumber ?? ""}
                      onChange={(e) => setEditing({ ...editing, whatsappNumber: e.target.value.trim() })}
                      placeholder="+966501234567"
                      className={`font-mono ${
                        editing.whatsappNumber && !isValidE164(editing.whatsappNumber)
                          ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                          : ""
                      }`}
                    />
                    <p className="mt-1 text-xs text-zinc-400">
                      {editing.whatsappNumber && !isValidE164(editing.whatsappNumber)
                        ? "Must start with + followed by 8-15 digits. No spaces or dashes."
                        : "Example: +966501234567 (Saudi Arabia)"}
                    </p>
                  </div>
                  <div>
                    <Label>Preferred Language</Label>
                    <div className="mt-2 flex gap-4 text-sm">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name={`buyerLang-${editing.id}`}
                          checked={(editing.preferredLanguage ?? "en") === "en"}
                          onChange={() => setEditing({ ...editing, preferredLanguage: "en" })}
                          className="h-4 w-4 accent-emerald-600"
                        />
                        English
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name={`buyerLang-${editing.id}`}
                          checked={editing.preferredLanguage === "ar"}
                          onChange={() => setEditing({ ...editing, preferredLanguage: "ar" })}
                          className="h-4 w-4 accent-emerald-600"
                        />
                        <span dir="rtl">&#x0627;&#x0644;&#x0639;&#x0631;&#x0628;&#x064A;&#x0629;</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <Label>Default Doc Preset</Label>
                    <Select
                      value={editing.defaultDocPreset ?? "buyer"}
                      onValueChange={(v) => v && setEditing({ ...editing, defaultDocPreset: v as BuyerDocPreset })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buyer">For Buyer (SC + CI + PL)</SelectItem>
                        <SelectItem value="bank">For Bank (SC + CI)</SelectItem>
                        <SelectItem value="customs">For Customs (CI-Customs + PL)</SelectItem>
                        <SelectItem value="all">All 4 documents</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="mb-1 flex items-center gap-3">
                      <Label className="m-0">Custom Message Template (optional)</Label>
                      <div className="flex gap-1 rounded-md border bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
                        <button
                          type="button"
                          onClick={() => setMsgLang("en")}
                          className={`rounded px-2 py-0.5 ${msgLang === "en" ? "bg-white font-medium shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
                        >EN</button>
                        <button
                          type="button"
                          onClick={() => setMsgLang("ar")}
                          className={`rounded px-2 py-0.5 ${msgLang === "ar" ? "bg-white font-medium shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
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
                      className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <p className="mt-1 text-xs text-zinc-400">
                      Supports: {"{buyerName}"}, {"{contractNo}"}, {"{productList}"}, {"{totalQty}"}, {"{etd}"}, {"{docList}"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <Button className="gap-2" onClick={handleSave} disabled={!editing.company.trim() || (!!editing.whatsappNumber && !isValidE164(editing.whatsappNumber))}>
                <Save className="h-4 w-4" /> Save Buyer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {buyers.length === 0 ? (
        <p className="py-16 text-center text-base text-zinc-400">No buyers yet. Click &ldquo;Add Buyer&rdquo; to create one.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-center">Contracts</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.company}{b.shortName && <span className="ml-2 text-zinc-400">({b.shortName})</span>}</TableCell>
                  <TableCell>{b.country || "\u2014"}</TableCell>
                  <TableCell className="text-sm">{b.email || "\u2014"}</TableCell>
                  <TableCell className="text-center">{contractCounts[b.company.toLowerCase()] ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing({ ...b })} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)} title="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
