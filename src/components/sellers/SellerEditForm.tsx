"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X, Save, ChevronDown, ChevronUp, Factory } from "lucide-react";
import type { Seller, SellerLanguage, SellerDocPreset } from "@/types/seller";
import { SELLER_COUNTRIES, isValidSellerE164 } from "@/types/seller";
import type { ProductProfile } from "@/types/product";
import { getProducts } from "@/lib/products";

function isValidEmail(email: string): boolean {
  if (!email) return true; // empty allowed
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface Props {
  open: boolean;
  initial: Seller;
  existingIds: string[];
  onSave: (seller: Seller) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

export default function SellerEditForm({ open, initial, existingIds, onSave, onCancel, onDelete }: Props) {
  const [draft, setDraft] = useState<Seller>(initial);
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [terms, setTerms] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgLang, setMsgLang] = useState<SellerLanguage>("en");
  const [countryIsOther, setCountryIsOther] = useState(false);
  const [customCountry, setCustomCountry] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
    setProducts(getProducts());
    setTerms(false);
    setMsgOpen(false);
    setMsgLang(initial.preferredLanguage ?? "en");
    // Handle "Other" country that's stored as a free-form value not in SELLER_COUNTRIES
    if (initial.country && !SELLER_COUNTRIES.includes(initial.country)) {
      setCountryIsOther(true);
      setCustomCountry(initial.country);
    } else {
      setCountryIsOther(initial.country === "Other");
      setCustomCountry("");
    }
  }, [open, initial]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const isNew = !existingIds.includes(draft.id);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!draft.companyName.trim()) e.companyName = "Company name is required";
    if (!draft.contactName.trim()) e.contactName = "Contact name is required";
    const country = countryIsOther ? customCountry.trim() : draft.country;
    if (!country) e.country = "Country is required";
    if (draft.whatsappNumber && !isValidSellerE164(draft.whatsappNumber)) {
      e.whatsappNumber = "Must start with + and 8\u201315 digits (no spaces)";
    }
    if (draft.email && !isValidEmail(draft.email)) e.email = "Invalid email";
    return e;
  }, [draft, countryIsOther, customCountry]);

  const canSave = Object.keys(errors).length === 0;

  const setField = useCallback(<K extends keyof Seller>(key: K, value: Seller[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const toggleProduct = useCallback((id: string) => {
    setDraft((d) => {
      const on = d.products.includes(id);
      return { ...d, products: on ? d.products.filter((p) => p !== id) : [...d.products, id] };
    });
  }, []);

  const setBank = useCallback(<K extends keyof NonNullable<Seller["bankDetails"]>>(key: K, value: string) => {
    setDraft((d) => ({ ...d, bankDetails: { ...(d.bankDetails ?? {}), [key]: value } }));
  }, []);

  const setTemplate = useCallback((lang: SellerLanguage, value: string) => {
    setDraft((d) => ({
      ...d,
      customMessageTemplate: { ...(d.customMessageTemplate ?? {}), [lang]: value },
    }));
  }, []);

  const handleSaveClick = useCallback(() => {
    if (!canSave) return;
    const country = countryIsOther ? customCountry.trim() : draft.country;
    onSave({ ...draft, country });
  }, [canSave, countryIsOther, customCountry, draft, onSave]);

  const handleDeleteClick = useCallback(() => {
    if (!onDelete) return;
    if (!confirm(`Delete seller "${draft.companyName || "(unnamed)"}"? This cannot be undone.`)) return;
    onDelete(draft.id);
  }, [draft, onDelete]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4 dark:bg-zinc-900">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Factory className="h-5 w-5 text-emerald-600" />
            {isNew ? "New Seller / Factory" : "Edit Seller"}
          </h2>
          <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {/* A) Company Info */}
          <Section title="Company Info">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Company Name (EN) <span className="text-red-500">*</span></Label>
                <Input value={draft.companyName} onChange={(e) => setField("companyName", e.target.value)} placeholder="Shandong XYZ Ginger Processing Co., Ltd." />
                {errors.companyName && <p className="mt-1 text-xs text-red-600">{errors.companyName}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label>Company Name (CN)</Label>
                <Input
                  value={draft.companyNameCn ?? ""}
                  onChange={(e) => setField("companyNameCn", e.target.value)}
                  lang="zh"
                  dir="auto"
                  placeholder="&#x5C71;&#x4E1C;XYZ&#x59DC;&#x52A0;&#x5DE5;&#x6709;&#x9650;&#x516C;&#x53F8;"
                />
              </div>
              <div>
                <Label>Country <span className="text-red-500">*</span></Label>
                <Select
                  value={countryIsOther ? "Other" : draft.country || undefined}
                  onValueChange={(v) => {
                    if (!v) return;
                    if (v === "Other") {
                      setCountryIsOther(true);
                      setField("country", "Other");
                    } else {
                      setCountryIsOther(false);
                      setField("country", v);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {SELLER_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {countryIsOther && (
                  <Input
                    className="mt-2"
                    value={customCountry}
                    onChange={(e) => setCustomCountry(e.target.value)}
                    placeholder="Enter country name"
                  />
                )}
                {errors.country && <p className="mt-1 text-xs text-red-600">{errors.country}</p>}
              </div>
              <div>
                <Label>City</Label>
                <Input value={draft.city ?? ""} onChange={(e) => setField("city", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Address</Label>
                <Input value={draft.address ?? ""} onChange={(e) => setField("address", e.target.value)} />
              </div>
            </div>
          </Section>

          {/* B) Primary Contact */}
          <Section title="Primary Contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Contact Name <span className="text-red-500">*</span></Label>
                <Input value={draft.contactName} onChange={(e) => setField("contactName", e.target.value)} />
                {errors.contactName && <p className="mt-1 text-xs text-red-600">{errors.contactName}</p>}
              </div>
              <div>
                <Label>Contact Title</Label>
                <Input value={draft.contactTitle ?? ""} onChange={(e) => setField("contactTitle", e.target.value)} placeholder="Sales Manager" />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input value={draft.phoneNumber ?? ""} onChange={(e) => setField("phoneNumber", e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={draft.email ?? ""} onChange={(e) => setField("email", e.target.value)} />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label>WhatsApp Number (E.164, no spaces)</Label>
                <Input
                  value={draft.whatsappNumber ?? ""}
                  onChange={(e) => setField("whatsappNumber", e.target.value.trim())}
                  placeholder="+254712345678"
                  className={`font-mono ${errors.whatsappNumber ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""}`}
                />
                {errors.whatsappNumber
                  ? <p className="mt-1 text-xs text-red-600">{errors.whatsappNumber}</p>
                  : <p className="mt-1 text-xs text-zinc-400">Example: +8613800138000 (China)</p>}
              </div>
              <div className="sm:col-span-2">
                <Label>WeChat ID / Group Name</Label>
                <Input
                  value={draft.wechatId ?? ""}
                  onChange={(e) => setField("wechatId", e.target.value)}
                  placeholder="e.g. TAFAKAH \u00d7 Shandong Ginger Group"
                />
                <p className="mt-1 text-xs text-zinc-400">
                  Text label only. WeChat can&rsquo;t be auto-opened from the browser; this is shown during handoff so you know which group to paste into.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label>Preferred Language</Label>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <LangRadio
                    name={`lang-${draft.id}`}
                    value="en"
                    current={draft.preferredLanguage ?? "en"}
                    onChange={(v) => setField("preferredLanguage", v)}
                    label="English"
                  />
                  <LangRadio
                    name={`lang-${draft.id}`}
                    value="ar"
                    current={draft.preferredLanguage ?? "en"}
                    onChange={(v) => setField("preferredLanguage", v)}
                    label={<span dir="rtl">&#x0627;&#x0644;&#x0639;&#x0631;&#x0628;&#x064A;&#x0629;</span>}
                  />
                  <LangRadio
                    name={`lang-${draft.id}`}
                    value="zh"
                    current={draft.preferredLanguage ?? "en"}
                    onChange={(v) => setField("preferredLanguage", v)}
                    label="&#x4E2D;&#x6587;"
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* C) Products Supplied */}
          <Section title="Products Supplied">
            {products.length === 0 ? (
              <p className="text-sm text-zinc-400">No products in database yet. Add products on the Products page first.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {products.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded border bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800">
                    <input
                      type="checkbox"
                      checked={draft.products.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="font-mono text-xs text-zinc-400">{p.prefix}</span>
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            )}
            {products.length > 0 && draft.products.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">This factory supplies no products yet.</p>
            )}
          </Section>

          {/* D) Commercial Terms (collapsible) */}
          <Collapsible title="Commercial Terms" open={terms} onToggle={() => setTerms((v) => !v)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Payment Terms</Label>
                <textarea
                  rows={2}
                  value={draft.paymentTerms ?? ""}
                  onChange={(e) => setField("paymentTerms", e.target.value)}
                  placeholder="30% deposit, 70% before shipment"
                  className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div>
                <Label>Lead Time (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.leadTimeDays ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setField("leadTimeDays", v === "" ? undefined : Math.max(0, parseInt(v, 10) || 0));
                  }}
                  placeholder="15"
                />
              </div>
              <div className="sm:col-span-2">
                <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Bank Details</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Bank Name</Label>
                    <Input value={draft.bankDetails?.bankName ?? ""} onChange={(e) => setBank("bankName", e.target.value)} />
                  </div>
                  <div>
                    <Label>Account Name</Label>
                    <Input value={draft.bankDetails?.accountName ?? ""} onChange={(e) => setBank("accountName", e.target.value)} />
                  </div>
                  <div>
                    <Label>Account Number</Label>
                    <Input value={draft.bankDetails?.accountNumber ?? ""} onChange={(e) => setBank("accountNumber", e.target.value)} />
                  </div>
                  <div>
                    <Label>SWIFT</Label>
                    <Input value={draft.bankDetails?.swift ?? ""} onChange={(e) => setBank("swift", e.target.value)} className="font-mono" />
                  </div>
                </div>
              </div>
            </div>
          </Collapsible>

          {/* E) Messaging (collapsible) */}
          <Collapsible title="Messaging" open={msgOpen} onToggle={() => setMsgOpen((v) => !v)}>
            <div className="space-y-4">
              <div>
                <Label>Default Doc Preset</Label>
                <Select
                  value={draft.defaultDocPreset ?? "factory"}
                  onValueChange={(v) => v && setField("defaultDocPreset", v as SellerDocPreset)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="factory">Factory (SC + CI + PL)</SelectItem>
                    <SelectItem value="all">All 4 documents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-3">
                  <Label className="m-0">Custom Message Template (optional)</Label>
                  <div className="flex gap-1 rounded-md border bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
                    {(["en", "ar", "zh"] as const).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setMsgLang(l)}
                        className={`rounded px-2 py-0.5 ${msgLang === l ? "bg-white font-medium shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
                      >
                        {l === "en" ? "EN" : l === "ar" ? "AR" : "ZH"}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  dir="auto"
                  rows={6}
                  value={(draft.customMessageTemplate ?? {})[msgLang] ?? ""}
                  onChange={(e) => setTemplate(msgLang, e.target.value)}
                  placeholder={msgLang === "en"
                    ? "Leave empty to use the default. Variables: {sellerName}, {contactName}, {contractNo}, {productList}, {totalQty}, {etd}, {docList}"
                    : msgLang === "ar"
                    ? "\u0627\u062A\u0631\u0643\u0647 \u0641\u0627\u0631\u063A\u0627\u064B \u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0642\u0627\u0644\u0628 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A"
                    : "\u7559\u7A7A\u5C06\u4F7F\u7528\u9ED8\u8BA4\u6A21\u677F"}
                  className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <p className="mt-1 text-xs text-zinc-400">
                  Available: {"{sellerName}"}, {"{contactName}"}, {"{contractNo}"}, {"{productList}"}, {"{totalQty}"}, {"{etd}"}, {"{docList}"}
                </p>
              </div>
            </div>
          </Collapsible>

          {/* F) Notes */}
          <Section title="Notes">
            <textarea
              rows={3}
              value={draft.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Internal notes..."
              className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </Section>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-white px-6 py-4 dark:bg-zinc-900">
          <div>
            {!isNew && onDelete && (
              <Button variant="outline" size="sm" onClick={handleDeleteClick} className="text-red-600 hover:bg-red-50">
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button onClick={handleSaveClick} disabled={!canSave} className="gap-1">
              <Save className="h-4 w-4" /> Save Seller
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Presentational helpers ───────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}

function Collapsible({ title, open, onToggle, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg border bg-zinc-50 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700"
      >
        <span>{title}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="mt-3 rounded-lg border bg-white p-4 dark:bg-zinc-900">{children}</div>}
    </div>
  );
}

function LangRadio<T extends string>({ name, value, current, onChange, label }: {
  name: string;
  value: T;
  current: T;
  onChange: (v: T) => void;
  label: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="radio"
        name={name}
        checked={current === value}
        onChange={() => onChange(value)}
        className="h-4 w-4 accent-emerald-600"
      />
      {label}
    </label>
  );
}
