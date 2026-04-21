"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X, MessageCircle, Download, Copy, RotateCcw, AlertTriangle, Loader2, ExternalLink, Factory, MessageSquare, Check, ClipboardCheck } from "lucide-react";
import type { ContractLogEntry } from "@/types/sales-contract";
import type { Buyer, BuyerDocPreset } from "@/types/buyer";
import { readBuyerMessaging } from "@/types/buyer";
import type { Seller, SellerLanguage } from "@/types/seller";
import { readSellerMessaging } from "@/types/seller";
import { findBuyerByCompany } from "@/lib/buyers";
import { getSellerById } from "@/lib/sellers";
import { isWechatHandoffEnabled } from "@/lib/settings";
import { calcTotals } from "@/lib/sales-contract";
import { getShipping } from "@/lib/shipping";
import { DOC_LABELS, DOC_ORDER, PRESET_DOCS, downloadContractPdfs, type QuickShareDoc } from "@/lib/quick-share/download";
import {
  renderTemplate,
  resolveTemplate,
  resolveSellerTemplate,
  type TemplateLanguage,
} from "@/lib/quick-share/templates";

export type QuickShareRecipientType = "buyer" | "factory";

interface Props {
  open: boolean;
  onClose: () => void;
  contract: ContractLogEntry;
  /** Defaults to "buyer" for backwards compatibility. */
  recipientType?: QuickShareRecipientType;
  /** If provided, overrides the recipient's default preset when the dialog opens. */
  initialDocs?: QuickShareDoc[];
  /** Fired only on clean send completion (all selected docs saved AND WhatsApp opened,
   *  OR partial with user confirmation in the "Download + Open" flow).
   *  Not fired on full-cancel, pure downloads, or errors. Use this to advance workflow stages. */
  onSent?: (docsSent: QuickShareDoc[]) => void;
}

const FLAG_BY_COUNTRY: Record<string, string> = {
  "+966": "\ud83c\uddf8\ud83c\udde6",
  "+971": "\ud83c\udde6\ud83c\uddea",
  "+965": "\ud83c\uddf0\ud83c\uddfc",
  "+974": "\ud83c\uddf6\ud83c\udde6",
  "+973": "\ud83c\udde7\ud83c\udded",
  "+968": "\ud83c\uddf4\ud83c\uddf2",
  "+86": "\ud83c\udde8\ud83c\uddf3",
  "+254": "\ud83c\uddf0\ud83c\uddea",
  "+20": "\ud83c\uddea\ud83c\uddec",
  "+90": "\ud83c\uddf9\ud83c\uddf7",
  "+91": "\ud83c\uddee\ud83c\uddf3",
};

function flagFor(whatsapp: string): string {
  if (!whatsapp.startsWith("+")) return "\ud83c\udf10";
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

const FACTORY_PRESET: Record<"factory" | "all", QuickShareDoc[]> = {
  factory: ["sc", "ci", "pl"],
  all: ["sc", "ci", "ci-customs", "pl"],
};

export default function QuickShareDialog({ open, onClose, contract, recipientType = "buyer", initialDocs, onSent }: Props) {
  const router = useRouter();
  const isFactory = recipientType === "factory";

  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [lang, setLang] = useState<TemplateLanguage>("en");
  const [selected, setSelected] = useState<QuickShareDoc[]>(PRESET_DOCS.buyer);
  const [message, setMessage] = useState("");
  const [messageDirty, setMessageDirty] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ index: number; total: number; label: string } | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [wechatHandoff, setWechatHandoff] = useState<{ savedCount: number; totalCount: number } | null>(null);
  const [wechatEnabled, setWechatEnabled] = useState(false);

  const showToast = useCallback((type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Resolve buyer OR seller when dialog opens
  useEffect(() => {
    if (!open) return;
    if (isFactory) {
      const sellerId = contract.masterSnapshot.sellerId ?? contract.sellerId;
      const s = sellerId ? getSellerById(sellerId) ?? null : null;
      setSeller(s);
      const msgs = readSellerMessaging(s);
      setLang(msgs.preferredLanguage);
      const preset = msgs.defaultDocPreset === "all" ? FACTORY_PRESET.all : FACTORY_PRESET.factory;
      setSelected(initialDocs && initialDocs.length > 0 ? [...initialDocs] : preset);
    } else {
      const found = findBuyerByCompany(contract.buyer) ?? findBuyerByCompany(contract.masterSnapshot.buyer.company) ?? null;
      setBuyer(found);
      const msgs = readBuyerMessaging(found);
      setLang(msgs.preferredLanguage);
      const preset = PRESET_DOCS[msgs.defaultDocPreset as BuyerDocPreset] ?? PRESET_DOCS.buyer;
      setSelected(initialDocs && initialDocs.length > 0 ? [...initialDocs] : preset);
    }
    setMessageDirty(false);
    setWechatHandoff(null);
    setWechatEnabled(isWechatHandoffEnabled());
  }, [open, contract, isFactory, initialDocs]);

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
    const products = Array.from(new Set(snap.lineItems.map((i) => i.product).filter(Boolean) as string[]));
    const shipping = open && typeof window !== "undefined" ? getShipping(contract.contractNo) : null;
    const etd = shipping?.atd || shipping?.etd || snap.identifiers.contractDate || "";

    const buyerName = buyer?.contactPerson?.trim() || buyer?.shortName?.trim() || contract.buyer;
    const contactName = seller?.contactName?.trim() || "";
    const sellerName = seller?.companyName?.trim() || "";

    return {
      buyerName,
      contactName,
      sellerName,
      contractNo: contract.contractNo,
      productList: products.join(", ") || contract.product || "\u2014",
      totalQty: totals.totalQtyMTS,
      etd,
      docList: buildDocList(selected),
    };
  }, [buyer, seller, contract, selected, totals, open]);

  const rendered = useMemo(() => {
    if (isFactory) {
      const template = resolveSellerTemplate(lang, seller?.customMessageTemplate);
      return renderTemplate(template, templateVars, lang);
    }
    // Buyer path — restrict to en/ar at the template layer but zh wouldn't render here anyway
    const template = resolveTemplate(lang === "zh" ? "en" : lang, buyer?.customMessageTemplate);
    return renderTemplate(template, templateVars, lang === "zh" ? "en" : lang);
  }, [isFactory, lang, buyer, seller, templateVars]);

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

  /** Runs the sequential PDF save flow and returns the result, or null if nothing selected. */
  const runDownload = useCallback(async () => {
    if (selected.length === 0) return null;
    setDownloading(true);
    setDownloadProgress(null);
    try {
      return await downloadContractPdfs(contract.masterSnapshot, selected, {
        onProgress: (doc, index, total) => setDownloadProgress({ index, total, label: DOC_LABELS[doc] }),
        onFallbackNotice: (m) => showToast("info", m),
      });
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  }, [contract, selected, showToast]);

  const handleDownloadOnly = useCallback(async () => {
    try {
      const result = await runDownload();
      if (!result) return;
      const total = selected.length;
      if (result.cancelled && result.saved === 0) {
        showToast("info", "Download cancelled.");
      } else if (result.cancelled) {
        showToast("info", `Saved ${result.saved} of ${total}. Cancelled before finishing.`);
      } else {
        showToast("success", `Saved ${result.saved} document${result.saved === 1 ? "" : "s"}.`);
        onClose();
      }
    } catch (err) {
      showToast("error", (err as Error).message || "Download failed");
    }
  }, [runDownload, selected.length, onClose, showToast]);

  // Determine recipient's WhatsApp number
  const recipientWhatsapp = isFactory ? (seller?.whatsappNumber ?? "") : (buyer?.whatsappNumber ?? "");
  const hasNumber = !!recipientWhatsapp;

  const handleDownloadAndOpen = useCallback(async () => {
    if (!recipientWhatsapp) return;
    if (selected.length === 0) return;

    const waWindow = window.open("about:blank", "_blank");
    const numberNoPlus = recipientWhatsapp.replace(/^\+/, "");
    const waUrl = `https://wa.me/${numberNoPlus}?text=${encodeURIComponent(message)}`;

    try {
      const result = await runDownload();
      if (!result) {
        waWindow?.close();
        return;
      }
      const total = selected.length;

      if (result.cancelled && result.saved === 0) {
        waWindow?.close();
        showToast("info", "Download cancelled. WhatsApp not opened.");
        return;
      }

      if (result.cancelled && result.saved > 0) {
        const proceed = confirm(
          `You saved ${result.saved} of ${total} documents. Open WhatsApp anyway?`
        );
        if (!proceed) {
          waWindow?.close();
          showToast("info", `Saved ${result.saved} of ${total}. WhatsApp not opened.`);
          return;
        }
      }

      if (waWindow) {
        waWindow.location.href = waUrl;
      } else {
        window.location.href = waUrl;
      }
      showToast("success", `Saved ${result.saved} of ${total}. Opening WhatsApp\u2026`);
      // Fire onSent on clean-or-user-confirmed completion
      onSent?.([...selected]);
      onClose();
    } catch (err) {
      waWindow?.close();
      showToast("error", (err as Error).message || "Download failed");
    }
  }, [recipientWhatsapp, selected, message, runDownload, onClose, onSent, showToast]);

  const handleDownloadAndWechat = useCallback(async () => {
    if (!seller?.wechatId) return;
    if (selected.length === 0) return;
    try {
      const result = await runDownload();
      if (!result) return;
      const total = selected.length;
      if (result.cancelled && result.saved === 0) {
        showToast("info", "Download cancelled.");
        return;
      }
      // Copy message to clipboard so user can paste into WeChat
      try {
        await navigator.clipboard.writeText(message);
      } catch {
        // Clipboard may be blocked; we still show the handoff so user can copy manually
      }
      setWechatHandoff({ savedCount: result.saved, totalCount: total });
    } catch (err) {
      showToast("error", (err as Error).message || "Download failed");
    }
  }, [seller, selected.length, message, runDownload, showToast]);

  const confirmWechatSent = useCallback(() => {
    setWechatHandoff(null);
    onSent?.([...selected]);
    onClose();
  }, [selected, onSent, onClose]);

  const handleAddNumber = useCallback(() => {
    if (isFactory) {
      if (seller) router.push(`/sellers?edit=${encodeURIComponent(seller.id)}&focus=whatsapp`);
      else router.push("/sellers");
    } else {
      if (buyer) router.push(`/buyers?edit=${encodeURIComponent(buyer.id)}&focus=whatsapp`);
      else router.push("/buyers");
    }
    onClose();
  }, [isFactory, buyer, seller, onClose, router]);

  const goPickSeller = useCallback(() => {
    router.push("/sellers");
    onClose();
  }, [onClose, router]);

  if (!open) return null;

  const recipientLabel = isFactory ? "Factory / Seller" : "Buyer";
  const recipientDisplayName = isFactory
    ? (seller?.companyName ?? "(no factory selected)")
    : contract.buyer;
  const recipientContact = isFactory ? seller?.contactName : buyer?.contactPerson;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4 dark:bg-zinc-900">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            {isFactory
              ? <Factory className="h-5 w-5 text-emerald-600" />
              : <MessageCircle className="h-5 w-5 text-[#25D366]" />}
            Send to {isFactory ? "Factory" : "WhatsApp"} &mdash; Contract <span className="font-mono">{contract.contractNo}</span>
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              WhatsApp Web may require a VPN from mainland China. If it doesn&rsquo;t open,
              click <span className="font-semibold">Copy Message</span> and send from your phone.
            </span>
          </div>

          {/* Recipient section */}
          <div className="rounded-lg border bg-zinc-50 p-4 dark:bg-zinc-800">
            <Label className="text-xs text-zinc-500">{recipientLabel}</Label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{recipientDisplayName}</p>
                {recipientContact && <p className="text-xs text-zinc-500">Attn: {recipientContact}</p>}
                {isFactory && !seller && (
                  <p className="mt-1 text-xs text-amber-700">
                    No factory selected on this contract.{" "}
                    <button onClick={goPickSeller} className="underline hover:text-amber-900">Pick a seller</button>
                  </p>
                )}
              </div>
              {hasNumber ? (
                <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm dark:bg-zinc-900">
                  <span className="text-base leading-none">{flagFor(recipientWhatsapp)}</span>
                  <span className="font-mono">{recipientWhatsapp}</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>
                    {isFactory
                      ? (seller ? `No WhatsApp number for ${seller.companyName}` : "Select a factory first")
                      : `No WhatsApp number for ${contract.buyer}`}
                  </span>
                  {(isFactory ? !!seller : true) && (
                    <Button size="sm" variant="outline" onClick={handleAddNumber} className="gap-1">
                      <ExternalLink className="h-3 w-3" /> Add WhatsApp
                    </Button>
                  )}
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
              <LangTab current={lang} value="en" onClick={() => { setLang("en"); setMessageDirty(false); }} label="English" />
              <LangTab current={lang} value="ar" onClick={() => { setLang("ar"); setMessageDirty(false); }} label={<span dir="rtl">&#x0627;&#x0644;&#x0639;&#x0631;&#x0628;&#x064A;&#x0629;</span>} />
              {isFactory && (
                <LangTab current={lang} value="zh" onClick={() => { setLang("zh"); setMessageDirty(false); }} label="&#x4E2D;&#x6587;" />
              )}
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

          {downloadProgress && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              {downloading
                ? `Saving ${downloadProgress.index} of ${downloadProgress.total}: ${downloadProgress.label}`
                : `Downloading ${downloadProgress.index} of ${downloadProgress.total}: ${downloadProgress.label}`}
            </div>
          )}

          {toast && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
              toast.type === "error" ? "border-red-200 bg-red-50 text-red-800" :
              "border-zinc-200 bg-zinc-50 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
            }`}>
              {toast.msg}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-white px-6 py-4 dark:bg-zinc-900">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            className="gap-1"
            disabled={downloading || selected.length === 0}
            onClick={handleDownloadOnly}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Saving\u2026" : "Download PDFs Only"}
          </Button>
          <Button
            style={{ backgroundColor: "#25D366" }}
            className="gap-1 text-white hover:opacity-90"
            disabled={downloading || selected.length === 0 || !hasNumber}
            onClick={handleDownloadAndOpen}
            title={!hasNumber ? `Add a WhatsApp number to the ${isFactory ? "factory" : "buyer"} first` : ""}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            {downloading ? "Saving\u2026" : "Download + Open WhatsApp"}
          </Button>
          {isFactory && wechatEnabled && (
            <Button
              style={{ backgroundColor: "#07C160" }}
              className="gap-1 text-white hover:opacity-90"
              disabled={downloading || selected.length === 0 || !seller?.wechatId}
              onClick={handleDownloadAndWechat}
              title={!seller?.wechatId ? "Add a WeChat ID / group name to the factory first" : ""}
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              {downloading ? "Saving\u2026" : "Download + Send via WeChat"}
            </Button>
          )}
        </div>
      </div>

      {/* WeChat handoff panel */}
      {wechatHandoff && seller && (
        <WechatHandoff
          seller={seller}
          saved={wechatHandoff.savedCount}
          total={wechatHandoff.totalCount}
          onMarkSent={confirmWechatSent}
          onBack={() => setWechatHandoff(null)}
        />
      )}
    </div>
  );
}

function LangTab({ current, value, onClick, label }: {
  current: TemplateLanguage;
  value: TemplateLanguage;
  onClick: () => void;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded px-3 py-1.5 ${current === value ? "bg-white font-medium shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
      dir={value === "ar" ? "rtl" : undefined}
    >
      {label}
    </button>
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

/* ──────────────────────────────────────────────────────── */
/*                   WeChat handoff modal                  */
/* ──────────────────────────────────────────────────────── */
function WechatHandoff({ seller, saved, total, onMarkSent, onBack }: {
  seller: Seller;
  saved: number;
  total: number;
  onMarkSent: () => void;
  onBack: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onBack}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <MessageSquare className="h-5 w-5" style={{ color: "#07C160" }} />
            Send via WeChat
          </h3>
          <button onClick={onBack} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-6 py-5 text-sm">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            <p className="flex items-center gap-1 font-medium">
              <ClipboardCheck className="h-3.5 w-3.5" /> Message copied to clipboard
            </p>
            <p className="mt-0.5">Saved {saved} of {total} document{total === 1 ? "" : "s"} to your chosen location.</p>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Target</p>
            <div className="rounded-lg border bg-zinc-50 px-4 py-3 font-medium dark:bg-zinc-800">
              {seller.wechatId}
            </div>
            <p className="mt-1 text-xs text-zinc-400">Factory: {seller.companyName}</p>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Steps</p>
            <ol className="list-inside list-decimal space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
              <li>Open WeChat on your phone or desktop.</li>
              <li>Find the chat / group: <span className="font-mono">{seller.wechatId}</span>.</li>
              <li>Paste the message (already in your clipboard).</li>
              <li>Attach the PDFs you just saved.</li>
              <li>Send.</li>
            </ol>
          </div>

          <p className="text-xs text-zinc-400">
            WeChat can&rsquo;t be auto-opened from the browser. Once you&rsquo;ve sent the message, click below to advance the workflow.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button
            onClick={onMarkSent}
            style={{ backgroundColor: "#07C160" }}
            className="gap-1 text-white hover:opacity-90"
          >
            <Check className="h-4 w-4" /> Mark as Sent
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Re-export for consumers that want the types */
export type { Seller };
