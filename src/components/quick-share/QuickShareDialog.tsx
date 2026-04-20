"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X, MessageCircle, Download, Copy, RotateCcw, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import type { ContractLogEntry } from "@/types/sales-contract";
import type { Buyer, BuyerLanguage, BuyerDocPreset } from "@/types/buyer";
import { readBuyerMessaging } from "@/types/buyer";
import { findBuyerByCompany } from "@/lib/buyers";
import { calcTotals } from "@/lib/sales-contract";
import { getShipping } from "@/lib/shipping";
import { DOC_LABELS, DOC_ORDER, PRESET_DOCS, downloadContractPdfs, type QuickShareDoc } from "@/lib/quick-share/download";
import { renderTemplate, resolveTemplate } from "@/lib/quick-share/templates";

interface Props {
  open: boolean;
  onClose: () => void;
  contract: ContractLogEntry;
}

const FLAG_BY_COUNTRY: Record<string, string> = {
  "+966": "\ud83c\uddf8\ud83c\udde6", // SA
  "+971": "\ud83c\udde6\ud83c\uddea", // AE
  "+965": "\ud83c\uddf0\ud83c\uddfc", // KW
  "+974": "\ud83c\uddf6\ud83c\udde6", // QA
  "+973": "\ud83c\udde7\ud83c\udded", // BH
  "+968": "\ud83c\uddf4\ud83c\uddf2", // OM
  "+86": "\ud83c\udde8\ud83c\uddf3", // CN
  "+254": "\ud83c\uddf0\ud83c\uddea", // KE
  "+20": "\ud83c\uddea\ud83c\uddec", // EG
  "+90": "\ud83c\uddf9\ud83c\uddf7", // TR
  "+91": "\ud83c\uddee\ud83c\uddf3", // IN
};

function flagFor(whatsapp: string): string {
  if (!whatsapp.startsWith("+")) return "\ud83c\udf10";
  // Match longest prefix (e.g. +966 before +9)
  const prefixes = Object.keys(FLAG_BY_COUNTRY).sort((a, b) => b.length - a.length);
  for (const p of prefixes) if (whatsapp.startsWith(p)) return FLAG_BY_COUNTRY[p];
  return "\ud83c\udf10";
}

function buildDocList(selected: QuickShareDoc[]): string {
  return DOC_ORDER
    .filter((d) => selected.includes(d))
    .map((d) => `\u2022 ${DOC_LABELS[d]}`)
    .join("\n");
}

const CHAR_WARN_LIMIT = 1800;

export default function QuickShareDialog({ open, onClose, contract }: Props) {
  const router = useRouter();
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [lang, setLang] = useState<BuyerLanguage>("en");
  const [selected, setSelected] = useState<QuickShareDoc[]>(PRESET_DOCS.buyer);
  const [message, setMessage] = useState("");
  const [messageDirty, setMessageDirty] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ index: number; total: number; label: string } | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);

  // Resolve buyer from the contract when dialog opens
  useEffect(() => {
    if (!open) return;
    const found = findBuyerByCompany(contract.buyer) ?? findBuyerByCompany(contract.masterSnapshot.buyer.company) ?? null;
    setBuyer(found);
    const msgs = readBuyerMessaging(found);
    setLang(msgs.preferredLanguage);
    setSelected(PRESET_DOCS[msgs.defaultDocPreset as BuyerDocPreset] ?? PRESET_DOCS.buyer);
    setMessageDirty(false);
  }, [open, contract]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const totals = useMemo(() => calcTotals(contract.masterSnapshot.lineItems), [contract]);

  const templateVars = useMemo(() => {
    const snap = contract.masterSnapshot;
    const buyerName = buyer?.contactPerson?.trim() || buyer?.shortName?.trim() || contract.buyer;
    const products = Array.from(new Set(snap.lineItems.map((i) => i.product).filter(Boolean) as string[]));
    // Only query localStorage on the client (dialog may be mounted during SSR)
    const shipping = open && typeof window !== "undefined" ? getShipping(contract.contractNo) : null;
    const etd = shipping?.atd || shipping?.etd || snap.identifiers.contractDate || "";
    return {
      buyerName,
      contractNo: contract.contractNo,
      productList: products.join(", ") || contract.product || "\u2014",
      totalQty: totals.totalQtyMTS,
      etd,
      docList: buildDocList(selected),
    };
  }, [buyer, contract, selected, totals, open]);

  const rendered = useMemo(() => {
    const template = resolveTemplate(lang, buyer?.customMessageTemplate);
    return renderTemplate(template, templateVars, lang);
  }, [lang, buyer, templateVars]);

  // Regenerate message when template inputs change, unless user edited it manually
  useEffect(() => {
    if (!open) return;
    if (!messageDirty) setMessage(rendered);
  }, [rendered, messageDirty, open]);

  const charCount = message.length;
  const overLimit = charCount > CHAR_WARN_LIMIT;

  const toggleDoc = useCallback((doc: QuickShareDoc) => {
    setSelected((prev) => prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]);
  }, []);

  const resetMessage = useCallback(() => {
    setMessage(rendered);
    setMessageDirty(false);
  }, [rendered]);

  const copyMessage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1500);
    } catch {
      // Silently ignore
    }
  }, [message]);

  const doDownload = useCallback(async () => {
    if (selected.length === 0) return;
    setDownloading(true);
    setDownloadProgress(null);
    try {
      await downloadContractPdfs(contract, selected, {
        onProgress: (doc, index, total) => setDownloadProgress({ index, total, label: DOC_LABELS[doc] }),
      });
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  }, [contract, selected]);

  const handleDownloadOnly = useCallback(async () => {
    await doDownload();
    onClose();
  }, [doDownload, onClose]);

  const handleDownloadAndOpen = useCallback(async () => {
    if (!buyer?.whatsappNumber) return;
    await doDownload();
    const numberNoPlus = buyer.whatsappNumber.replace(/^\+/, "");
    const url = `https://wa.me/${numberNoPlus}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }, [buyer, doDownload, message, onClose]);

  const handleAddNumber = useCallback(() => {
    if (buyer) {
      router.push(`/buyers?edit=${encodeURIComponent(buyer.id)}&focus=whatsapp`);
    } else {
      router.push("/buyers");
    }
    onClose();
  }, [buyer, onClose, router]);

  if (!open) return null;

  const messaging = readBuyerMessaging(buyer);
  const hasNumber = !!messaging.whatsappNumber;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4 dark:bg-zinc-900">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            Send to WhatsApp &mdash; Contract <span className="font-mono">{contract.contractNo}</span>
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Mainland China banner */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              WhatsApp Web may require a VPN from mainland China. If it doesn&rsquo;t open,
              click <span className="font-semibold">Copy Message</span> and send from your phone.
            </span>
          </div>

          {/* Buyer section */}
          <div className="rounded-lg border bg-zinc-50 p-4 dark:bg-zinc-800">
            <Label className="text-xs text-zinc-500">Buyer</Label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div>
                <p className="text-base font-semibold">{contract.buyer}</p>
                {buyer?.contactPerson && <p className="text-xs text-zinc-500">Attn: {buyer.contactPerson}</p>}
              </div>
              {hasNumber ? (
                <div className="ml-auto flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm dark:bg-zinc-900">
                  <span className="text-base leading-none">{flagFor(messaging.whatsappNumber)}</span>
                  <span className="font-mono">{messaging.whatsappNumber}</span>
                </div>
              ) : (
                <div className="ml-auto flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>No WhatsApp number for {contract.buyer}</span>
                  <Button size="sm" variant="outline" onClick={handleAddNumber} className="gap-1">
                    <ExternalLink className="h-3 w-3" /> Add WhatsApp Number
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Doc selection */}
          <div>
            <div className="flex items-center justify-between">
              <Label>Documents to download</Label>
              <span className="text-xs text-zinc-400">{selected.length} document{selected.length === 1 ? "" : "s"} will be downloaded</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DOC_ORDER.map((doc) => (
                <label key={doc} className="flex cursor-pointer items-center gap-2 rounded border bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800">
                  <input
                    type="checkbox"
                    checked={selected.includes(doc)}
                    onChange={() => toggleDoc(doc)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span>{DOC_LABELS[doc]}</span>
                  {doc === "ci-customs" && <span className="ml-auto text-xs text-zinc-400">(internal)</span>}
                </label>
              ))}
            </div>
          </div>

          {/* Language toggle */}
          <div>
            <Label>Message language</Label>
            <div className="mt-2 flex gap-1 rounded-md border bg-zinc-100 p-0.5 text-sm dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => { setLang("en"); setMessageDirty(false); }}
                className={`flex-1 rounded px-3 py-1.5 ${lang === "en" ? "bg-white font-medium shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
              >English</button>
              <button
                type="button"
                onClick={() => { setLang("ar"); setMessageDirty(false); }}
                className={`flex-1 rounded px-3 py-1.5 ${lang === "ar" ? "bg-white font-medium shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
                dir="rtl"
              >&#x0627;&#x0644;&#x0639;&#x0631;&#x0628;&#x064A;&#x0629;</button>
            </div>
          </div>

          {/* Message preview */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Message preview</Label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${overLimit ? "font-semibold text-red-600" : "text-zinc-400"}`}>
                  {charCount} / {CHAR_WARN_LIMIT}
                </span>
                <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={resetMessage} disabled={!messageDirty}>
                  <RotateCcw className="h-3 w-3" /> Reset
                </Button>
                <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={copyMessage}>
                  <Copy className="h-3 w-3" /> {copyFlash ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <textarea
              dir="auto"
              rows={12}
              value={message}
              onChange={(e) => { setMessage(e.target.value); setMessageDirty(true); }}
              className={`flex w-full rounded-md border bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:ring-1 focus:ring-zinc-200 dark:bg-zinc-900 ${
                overLimit ? "border-red-400 focus:border-red-500" : "border-zinc-200 focus:border-zinc-300"
              }`}
            />
            {overLimit && (
              <p className="mt-1 text-xs text-red-600">
                Over {CHAR_WARN_LIMIT} characters &mdash; WhatsApp may truncate long messages around 2000 chars.
              </p>
            )}
          </div>

          {/* Download progress */}
          {downloadProgress && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              Downloading {downloadProgress.index} of {downloadProgress.total}: {downloadProgress.label}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-white px-6 py-4 dark:bg-zinc-900">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            className="gap-1"
            disabled={downloading || selected.length === 0}
            onClick={handleDownloadOnly}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDFs Only
          </Button>
          <Button
            style={{ backgroundColor: "#25D366" }}
            className="gap-1 text-white hover:opacity-90"
            disabled={downloading || selected.length === 0 || !hasNumber}
            onClick={handleDownloadAndOpen}
            title={!hasNumber ? "Add a WhatsApp number to the buyer first" : ""}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            Download + Open WhatsApp
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Convenience helper — a trigger button styled with WhatsApp green. */
export function QuickShareButton({
  onClick,
  size = "default",
  disabled,
  label = "Quick Share",
  className = "",
}: {
  onClick: () => void;
  size?: "sm" | "default" | "lg";
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      size={size}
      onClick={onClick}
      disabled={disabled}
      style={{ backgroundColor: "#25D366" }}
      className={`gap-2 text-white hover:opacity-90 disabled:opacity-50 ${className}`}
    >
      <MessageCircle className="h-4 w-4" />
      {label}
    </Button>
  );
}

