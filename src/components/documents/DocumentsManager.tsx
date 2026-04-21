"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ContractCombobox from "@/components/ui/contract-combobox";
import {
  FileX, Loader2, Settings, Upload, Trash2, Eye,
  CheckCircle, Clock, AlertTriangle, Package, X, ClipboardList,
} from "lucide-react";
import type { SalesContractData, ContractLogEntry, ContractTotals } from "@/types/sales-contract";
import type { TradeDocument, AnalyzeRequest, AnalyzeResponse, DocSlot } from "@/types/document";
import { RECEIVED_SLOTS, SLOT_LABELS, CATEGORY_LABELS, categoryToSlot } from "@/types/document";
import { calcTotals } from "@/lib/sales-contract";
import { loadActiveContract, saveActiveContract } from "@/lib/master-data";
import { getContractLog } from "@/lib/contract-log";
import { getDocuments, saveDocument, removeDocument as removeDoc, getDocumentFile, compressImage, migrateOldData } from "@/lib/documents";
import { getActiveProviderKey } from "@/lib/settings";
import { mergeDocuments } from "@/lib/pdf-merge";
import { getShipping, getStatusInfo } from "@/lib/shipping";
import { supportsSaveFilePicker, saveBlobWithPicker, saveBlobWithDownload } from "@/lib/quick-share/save-file";
import QuickShareDialog, { QuickShareButton } from "@/components/quick-share/QuickShareDialog";
import UploadZone from "./UploadZone";

/* ── Types for merge items ──────────────────────────── */
type MergeItemKey = "sc" | "ci" | "customs" | "pl" | DocSlot | string;
interface MergeItem {
  key: MergeItemKey;
  label: string;
  available: boolean;
  checked: boolean;
  isGenerated: boolean;
  docId?: string; // for received docs
}

/* ── Timeline ───────────────────────────────────────── */
function Timeline() {
  const steps = ["Master Data", "Generate Docs", "Send to Factory", "Receive & Upload", "Merge Package"];
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2 text-xs">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-zinc-300">&rarr;</span>}
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 ${
            i === 3 ? "bg-emerald-100 font-medium text-emerald-700" : i < 3 ? "text-zinc-400" : "text-zinc-300"
          }`}>{i < 3 ? "\u2713 " : ""}{s}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Validation row ─────────────────────────────────── */
function ValidationRow({ v }: { v: { field: string; status: string; expected?: string; actual?: string } }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {v.status === "match" && <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />}
      {v.status === "mismatch" && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />}
      {v.status === "missing" && <Clock className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />}
      <div>
        <span className="font-medium">{v.field}</span>
        {v.status === "mismatch" && <span className="text-red-600"> &mdash; expected &ldquo;{v.expected}&rdquo;, found &ldquo;{v.actual}&rdquo;</span>}
      </div>
    </div>
  );
}

/* ── Received document slot card ────────────────────── */
function ReceivedSlotCard({ slot, doc, onUpload, onRemove }: {
  slot: DocSlot; doc: TradeDocument | undefined; onUpload: (slot: DocSlot) => void; onRemove: (id: string) => void;
}) {
  const label = SLOT_LABELS[slot];
  if (!doc) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed border-zinc-300 px-4 py-3 dark:border-zinc-700">
        <div className="flex items-center gap-3"><Clock className="h-4 w-4 text-zinc-300" /><span className="text-sm text-zinc-500">{label}</span></div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => onUpload(slot)}><Upload className="h-3 w-3" /> Upload</Button>
      </div>
    );
  }
  const isProcessing = doc.status === "uploading" || doc.status === "analyzing";
  const hasIssues = doc.validationResults.some((v) => v.status === "mismatch");
  return (
    <Card className={hasIssues ? "border-amber-300" : doc.status === "ready" ? "border-emerald-200" : ""}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm">{label}</CardTitle>
          <p className="mt-0.5 truncate text-xs text-zinc-400">{doc.fileName}</p>
          <div className="mt-1 flex items-center gap-2">
            {isProcessing && <span className="flex items-center gap-1 text-xs text-amber-600"><Loader2 className="h-3 w-3 animate-spin" />{doc.status === "uploading" ? "Uploading..." : "Analyzing..."}</span>}
            {doc.status === "ready" && !hasIssues && <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="h-3 w-3" /> Verified</span>}
            {doc.status === "ready" && hasIssues && <span className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> Issues found</span>}
            {doc.status === "error" && <span className="text-xs text-red-500">{doc.error ?? "Error"}</span>}
            {doc.confidence > 0 && doc.status === "ready" && <span className="text-xs text-zinc-400">{Math.round(doc.confidence * 100)}%</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => onUpload(slot)} title="Replace"><Upload className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onRemove(doc.id)} title="Remove"><Trash2 className="h-4 w-4 text-red-500" /></Button>
        </div>
      </CardHeader>
      {doc.status === "ready" && (
        <CardContent className="space-y-3 pt-0">
          {Object.keys(doc.extractedFields).filter((k) => !k.startsWith("_")).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-zinc-500">Extracted Fields</p>
              <div className="grid gap-1 text-xs sm:grid-cols-2">
                {Object.entries(doc.extractedFields).map(([k, v]) => v && !k.startsWith("_") ? <div key={k}><span className="text-zinc-400">{k}: </span><span>{v}</span></div> : null)}
              </div>
            </div>
          )}
          {doc.validationResults.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-zinc-500">Validation</p>
              <div className="space-y-1">{doc.validationResults.map((v, i) => <ValidationRow key={i} v={v} />)}</div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                     */
/* ════════════════════════════════════════════════════ */
export default function DocumentsManager() {
  const [contracts, setContracts] = useState<ContractLogEntry[]>([]);
  const [selectedContractNo, setSelectedContractNo] = useState<string>("");
  const [docs, setDocs] = useState<TradeDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState("");
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeChecks, setMergeChecks] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [providerInfo, setProviderInfo] = useState<{ provider: string; hasKey: boolean }>({ provider: "gemini", hasKey: false });
  const [quickShareOpen, setQuickShareOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<DocSlot | null>(null);

  // Derived: selected contract entry
  const selectedContract = useMemo(
    () => contracts.find((c) => c.contractNo === selectedContractNo),
    [contracts, selectedContractNo]
  );
  const contractData = selectedContract?.masterSnapshot;
  const contractNo = selectedContract?.contractNo ?? "";
  const invoiceNo = selectedContract?.invoiceNo ?? "";
  const totals = useMemo(() => contractData ? calcTotals(contractData.lineItems) : null, [contractData]);

  // Init
  useEffect(() => {
    async function init() {
      await migrateOldData();
      const log = getContractLog();
      setContracts(log);
      const ac = loadActiveContract();
      const initial = ac?.contractNo && log.some((c) => c.contractNo === ac.contractNo)
        ? ac.contractNo
        : log[log.length - 1]?.contractNo ?? "";
      setSelectedContractNo(initial);
      if (initial) setDocs(getDocuments(initial));
      const pk = getActiveProviderKey();
      setProviderInfo({ provider: pk.provider, hasKey: !!pk.apiKey });
      setLoaded(true);
    }
    init();
  }, []);

  // When selected contract changes, reload docs
  const switchContract = useCallback((newContractNo: string) => {
    setSelectedContractNo(newContractNo);
    setDocs(getDocuments(newContractNo));
  }, []);

  const handleSetActive = useCallback(() => {
    if (!selectedContract) return;
    saveActiveContract({
      data: selectedContract.masterSnapshot,
      contractNo: selectedContract.contractNo,
      invoiceNo: selectedContract.invoiceNo,
      dateSubmitted: selectedContract.dateSubmitted,
    });
    showToastMsg("success", `${selectedContract.contractNo} is now the active contract`);
  }, [selectedContract]);

  const showToastMsg = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── File processing ──
  const processFile = useCallback(async (file: File, targetSlot?: DocSlot) => {
    if (!contractData || !contractNo) return;
    const isImage = file.type.startsWith("image/");
    const doc: TradeDocument = {
      id: crypto.randomUUID(), fileName: file.name, fileType: isImage ? "image" : "pdf",
      mimeType: file.type, base64Data: "", slot: targetSlot ?? "other", category: "unknown",
      confidence: 0, extractedFields: {}, validationResults: [], status: "uploading",
      addedAt: new Date().toISOString(),
    };
    setDocs((prev) => {
      const filtered = targetSlot && targetSlot !== "other" ? prev.filter((d) => d.slot !== targetSlot) : prev;
      return [...filtered, doc];
    });
    try {
      let base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (isImage) base64 = await compressImage(base64);
      doc.base64Data = base64;
      doc.status = "analyzing";
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...doc } : d)));

      const pk = getActiveProviderKey();
      const t = calcTotals(contractData.lineItems);
      const reqBody: AnalyzeRequest = {
        provider: pk.provider, apiKey: pk.apiKey, fileBase64: base64, fileName: file.name, mimeType: file.type,
        masterData: {
          contractNo, buyer: contractData.buyer.company, origin: contractData.shipping.origin,
          loadingPort: contractData.shipping.loadingPort, dischargePort: contractData.shipping.dischargePort,
          containerNumber: contractData.identifiers.containerNumber,
          products: contractData.lineItems.filter((i) => i.product).map((i) => i.product),
          hsCodes: contractData.lineItems.filter((i) => i.hsCode).map((i) => i.hsCode),
          totalNetWeight: t.totalNetWeight, totalGrossWeight: t.totalGrossWeight,
        },
      };
      const res = await fetch("/api/analyze-document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqBody) });
      if (!res.ok) throw new Error("Analysis API returned " + res.status);
      const analysis: AnalyzeResponse = await res.json();
      doc.category = analysis.category; doc.confidence = analysis.confidence;
      doc.extractedFields = analysis.extractedFields; doc.validationResults = analysis.validationResults;
      doc.status = "ready";
      if (!targetSlot) {
        doc.slot = categoryToSlot(analysis.category);
        if (doc.slot !== "other") showToastMsg("success", `Detected as ${SLOT_LABELS[doc.slot]} \u2014 assigned automatically`);
      }
      setDocs((prev) => {
        let updated = prev;
        if (!targetSlot && doc.slot !== "other") updated = prev.filter((d) => d.id === doc.id || d.slot !== doc.slot);
        return updated.map((d) => (d.id === doc.id ? { ...doc } : d));
      });
      await saveDocument(contractNo, doc);
    } catch (err) {
      doc.status = "error"; doc.error = (err as Error).message || "Processing failed";
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...doc } : d)));
    }
  }, [contractData, contractNo, showToastMsg]);

  const handleGeneralDrop = useCallback((files: File[]) => { for (const file of files) processFile(file); }, [processFile]);
  const handleSlotUpload = useCallback((slot: DocSlot) => { pendingSlotRef.current = slot; fileInputRef.current?.click(); }, []);
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    processFile(file, pendingSlotRef.current ?? undefined); pendingSlotRef.current = null; e.target.value = "";
  }, [processFile]);
  const handleRemove = useCallback((id: string) => {
    if (!contractNo) return;
    setDocs((prev) => prev.filter((d) => d.id !== id));
    removeDoc(contractNo, id);
  }, [contractNo]);

  // ── Merge items ──
  const slotMap = useMemo(() => {
    const m = new Map<DocSlot, TradeDocument>();
    const other: TradeDocument[] = [];
    for (const doc of docs) {
      if (doc.slot === "other") other.push(doc);
      else if (!m.has(doc.slot)) m.set(doc.slot, doc);
    }
    return { map: m, other };
  }, [docs]);

  const buildMergeItems = useCallback((): MergeItem[] => {
    const items: MergeItem[] = [
      { key: "sc", label: "Sales Contract", available: true, checked: true, isGenerated: true },
      { key: "ci", label: "Commercial Invoice", available: true, checked: true, isGenerated: true },
      { key: "customs", label: "Customs Invoice", available: true, checked: false, isGenerated: true },
      { key: "pl", label: "Packing List", available: true, checked: true, isGenerated: true },
    ];
    const receivedSlots: DocSlot[] = ["certificate_of_origin", "bill_of_lading", "phytosanitary_certificate", "health_certificate"];
    for (const s of receivedSlots) {
      const doc = slotMap.map.get(s);
      const available = !!doc && doc.status === "ready";
      items.push({ key: s, label: SLOT_LABELS[s], available, checked: available, isGenerated: false, docId: doc?.id });
    }
    for (const doc of slotMap.other) {
      if (doc.status === "ready") {
        items.push({ key: `other-${doc.id}`, label: doc.fileName, available: true, checked: true, isGenerated: false, docId: doc.id });
      }
    }
    return items;
  }, [slotMap]);

  const openMergeModal = useCallback(() => {
    const items = buildMergeItems();
    const checks: Record<string, boolean> = {};
    for (const item of items) checks[item.key] = item.checked;
    setMergeChecks(checks);
    setShowMergeModal(true);
  }, [buildMergeItems]);

  const toggleMergeCheck = useCallback((key: string) => {
    setMergeChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Presets
  const applyPreset = useCallback((preset: "all" | "bank" | "customs" | "buyer") => {
    const items = buildMergeItems();
    const checks: Record<string, boolean> = {};
    for (const item of items) {
      if (!item.available && !item.isGenerated) { checks[item.key] = false; continue; }
      if (preset === "all") { checks[item.key] = item.available || item.isGenerated; }
      else if (preset === "bank") { checks[item.key] = ["sc", "ci", "pl", "bill_of_lading"].includes(item.key); }
      else if (preset === "customs") { checks[item.key] = ["customs", "pl", "certificate_of_origin", "phytosanitary_certificate"].includes(item.key); }
      else if (preset === "buyer") { checks[item.key] = ["sc", "ci", "pl", "certificate_of_origin"].includes(item.key); }
      // Unavailable received docs stay unchecked
      if (!item.available && !item.isGenerated) checks[item.key] = false;
    }
    setMergeChecks(checks);
  }, [buildMergeItems]);

  // Merge execution
  const handleMerge = useCallback(async () => {
    if (!contractData || !totals || !contractNo) return;
    setMerging(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const items = buildMergeItems().filter((item) => mergeChecks[item.key]);
      const allDocs: TradeDocument[] = [];

      async function blobToDoc(blob: Blob, name: string): Promise<TradeDocument> {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = ""; for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = "data:application/pdf;base64," + btoa(binary);
        return { id: "", fileName: name, fileType: "pdf", mimeType: "application/pdf", base64Data: b64, slot: "other", category: "unknown", confidence: 0, extractedFields: {}, validationResults: [], status: "ready", addedAt: "" };
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setMergeProgress(`Preparing document ${i + 1} of ${items.length}: ${item.label}`);

        if (item.isGenerated) {
          if (item.key === "sc") {
            const { default: C } = await import("@/components/sales-contract/SalesContractPDF");
            const blob = await pdf(<C data={contractData} totals={totals} contractNumber={contractNo} />).toBlob();
            allDocs.push(await blobToDoc(blob, "Sales Contract"));
          } else if (item.key === "ci") {
            const { default: C } = await import("@/components/commercial-invoice/CommercialInvoicePDF");
            const blob = await pdf(<C data={contractData} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} />).toBlob();
            allDocs.push(await blobToDoc(blob, "Commercial Invoice"));
          } else if (item.key === "customs") {
            const { default: C } = await import("@/components/commercial-invoice/CommercialInvoicePDF");
            const blob = await pdf(<C data={contractData} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} priceFactor={0.55} />).toBlob();
            allDocs.push(await blobToDoc(blob, "Customs Invoice"));
          } else if (item.key === "pl") {
            const { default: C } = await import("@/components/packing-list/PackingListPDF");
            const blob = await pdf(<C data={contractData} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} />).toBlob();
            allDocs.push(await blobToDoc(blob, "Packing List"));
          }
        } else if (item.docId) {
          const fileData = await getDocumentFile(contractNo, item.docId);
          const docMeta = docs.find((d) => d.id === item.docId);
          if (fileData && docMeta) allDocs.push({ ...docMeta, base64Data: fileData });
        }
      }

      setMergeProgress("Merging all documents...");
      const merged = await mergeDocuments(allDocs);
      const blob = new Blob([merged.buffer as ArrayBuffer], { type: "application/pdf" });
      const filename = `Shipment_Package_${contractNo}.pdf`;

      if (supportsSaveFilePicker()) {
        setMergeProgress("Choose save location\u2026");
        const result = await saveBlobWithPicker(blob, filename);
        if (result === "cancelled") {
          showToastMsg("success", "Download cancelled.");
        } else {
          setShowMergeModal(false);
          showToastMsg("success", "Shipment package saved!");
        }
      } else {
        await saveBlobWithDownload(blob, filename);
        setShowMergeModal(false);
        showToastMsg("success", "Shipment package downloaded!");
      }
    } catch (err) {
      showToastMsg("error", "Merge failed: " + (err as Error).message);
    } finally {
      setMerging(false);
      setMergeProgress("");
    }
  }, [contractData, totals, contractNo, invoiceNo, docs, mergeChecks, buildMergeItems, showToastMsg]);

  // ── Render ──
  if (!loaded) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;

  if (contracts.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-20 text-center">
        <FileX className="h-12 w-12 text-zinc-400" />
        <h2 className="text-xl font-bold">No Contracts Submitted Yet</h2>
        <p className="text-zinc-600 dark:text-zinc-400">Submit a contract from the Master Data Sheet first.</p>
        <Link href="/master"><Button size="lg">Go to Master Data</Button></Link>
      </div>
    );
  }

  const providerLabel = providerInfo.provider === "gemini" ? "Google Gemini" : "Anthropic Claude";
  const receivedReady = docs.filter((d) => d.status === "ready").length;
  const totalExpected = 4 + RECEIVED_SLOTS.length;
  const totalReady = 4 + receivedReady;
  const progressPct = Math.round((totalReady / totalExpected) * 100);
  const mergeItems = buildMergeItems();
  const checkedCount = mergeItems.filter((i) => mergeChecks[i.key]).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileInput} />

      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg px-5 py-3 text-sm font-medium shadow-lg ${
          toast.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"
        }`}>{toast.message}</div>
      )}

      {/* ═══ CONTRACT SWITCHER ═══ */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3 dark:bg-zinc-900">
        <ClipboardList className="h-5 w-5 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-600">Working on:</span>
        <ContractCombobox
          contracts={contracts.slice().reverse()}
          value={selectedContractNo}
          onChange={switchContract}
        />
        <Button variant="outline" size="sm" onClick={handleSetActive}>Set as Active</Button>
        {selectedContract && (
          <QuickShareButton size="sm" label="Quick Share" onClick={() => setQuickShareOpen(true)} />
        )}
        {selectedContract && (() => {
          const sh = getShipping(selectedContract.contractNo);
          const info = getStatusInfo(sh);
          return (
            <Link
              href={`/shipping/${encodeURIComponent(selectedContract.contractNo)}`}
              className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:opacity-80 ${info.badgeColor}`}
              title="Shipping details"
            >
              {info.icon} {info.label}
              {info.daysLabel !== "\u2014" && <span className="text-[11px] font-normal opacity-80">&middot; {info.daysLabel}</span>}
            </Link>
          );
        })()}
      </div>

      {!contractData ? (
        <p className="py-10 text-center text-zinc-400">Select a contract above.</p>
      ) : (
        <>
          <Timeline />

          {/* Progress bar */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-zinc-500">Shipment Package: {totalReady} of {totalExpected} documents ready</span>
              <span className="font-medium">{progressPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Provider status */}
          {providerInfo.hasKey ? (
            <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-2 dark:bg-zinc-900">
              <span className="flex items-center gap-2 text-sm text-emerald-600">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />AI Provider: {providerLabel}
              </span>
              <Link href="/settings" className="text-zinc-400 hover:text-zinc-600"><Settings className="h-4 w-4" /></Link>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>AI not configured &mdash; classification by filename only</span>
              <Link href="/settings" className="font-medium underline">Set up in Settings</Link>
            </div>
          )}

          {/* ═══ SECTION A: Generated Documents ═══ */}
          <div>
            <h2 className="mb-3 text-lg font-bold">Your Generated Documents</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Sales Contract", href: "/sales-contract" },
                { label: "Commercial Invoice", href: "/commercial-invoice" },
                { label: "Customs Invoice", href: "/customs-invoice", note: "Internal use only" },
                { label: "Packing List", href: "/packing-list" },
              ].map((d) => (
                <div key={d.label} className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 dark:bg-zinc-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <div>
                      <span className="text-sm font-medium">{d.label}</span>
                      {d.note && <span className="ml-2 text-xs text-zinc-400">({d.note})</span>}
                    </div>
                  </div>
                  <Link href={d.href}><Button variant="outline" size="sm" className="gap-1"><Eye className="h-3 w-3" /> View</Button></Link>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ SECTION B: Received Documents ═══ */}
          <div>
            <h2 className="mb-3 text-lg font-bold">Received Documents</h2>
            <div className="mb-4">
              <UploadZone onFiles={handleGeneralDrop} />
              <p className="mt-1 text-center text-xs text-zinc-400">Drop files here and AI will auto-assign them to the correct slot</p>
            </div>
            <div className="space-y-3">
              {RECEIVED_SLOTS.filter((s) => s !== "other").map((slot) => (
                <ReceivedSlotCard key={slot} slot={slot} doc={slotMap.map.get(slot)} onUpload={handleSlotUpload} onRemove={handleRemove} />
              ))}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-600">Other Attachments</span>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => handleSlotUpload("other")}><Upload className="h-3 w-3" /> Add</Button>
                </div>
                {slotMap.other.length === 0 && <p className="text-xs text-zinc-400">No additional attachments</p>}
                {slotMap.other.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      {doc.status === "ready" ? <CheckCircle className="h-3 w-3 text-emerald-500" /> :
                       doc.status === "analyzing" ? <Loader2 className="h-3 w-3 animate-spin text-amber-500" /> :
                       <Clock className="h-3 w-3 text-zinc-300" />}
                      <span className="truncate">{doc.fileName}</span>
                      {doc.status === "ready" && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">{CATEGORY_LABELS[doc.category]}</span>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(doc.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ═══ MERGE ═══ */}
          <div className="space-y-3 rounded-lg border bg-white p-6 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Package className="h-5 w-5" /> Create Shipment Package</h2>
              <Button size="lg" className="gap-2" disabled={merging} onClick={openMergeModal}>
                {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                {merging ? "Merging..." : "Merge Documents"}
              </Button>
            </div>
            <p className="text-xs text-zinc-400">Choose which documents to include and download as one PDF.</p>
          </div>
        </>
      )}

      {/* ═══ MERGE MODAL ═══ */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Create Shipment Package</h3>
              <button onClick={() => setShowMergeModal(false)} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-2 text-xs text-zinc-400">Contract: {contractNo}</p>

            {/* Presets */}
            <div className="mb-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => applyPreset("all")}>Select All</Button>
              <Button variant="outline" size="sm" onClick={() => applyPreset("bank")}>For Bank</Button>
              <Button variant="outline" size="sm" onClick={() => applyPreset("customs")}>For Customs</Button>
              <Button variant="outline" size="sm" onClick={() => applyPreset("buyer")}>For Buyer</Button>
            </div>

            {/* Checklist */}
            <div className="max-h-72 space-y-1 overflow-y-auto">
              <p className="text-xs font-semibold text-zinc-400">YOUR GENERATED DOCUMENTS</p>
              {mergeItems.filter((i) => i.isGenerated).map((item) => (
                <label key={item.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  <input type="checkbox" checked={mergeChecks[item.key] ?? false} onChange={() => toggleMergeCheck(item.key)} className="h-4 w-4 accent-emerald-600" />
                  <span className="flex-1">{item.label}</span>
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                </label>
              ))}
              <p className="mt-2 text-xs font-semibold text-zinc-400">RECEIVED DOCUMENTS</p>
              {mergeItems.filter((i) => !i.isGenerated).map((item) => (
                <label key={item.key} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${item.available ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800" : "opacity-50"}`}>
                  <input type="checkbox" checked={mergeChecks[item.key] ?? false} onChange={() => item.available && toggleMergeCheck(item.key)} disabled={!item.available} className="h-4 w-4 accent-emerald-600" />
                  <span className="flex-1">{item.label}</span>
                  {item.available ? <CheckCircle className="h-3 w-3 text-emerald-500" /> : <span className="text-xs text-zinc-400">Not uploaded</span>}
                </label>
              ))}
            </div>

            <div className="mt-4 border-t pt-4">
              <p className="mb-3 text-sm text-zinc-500">Selected: <span className="font-medium">{checkedCount} documents</span></p>
              {mergeProgress && <p className="mb-2 text-xs text-amber-600">{mergeProgress}</p>}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowMergeModal(false)}>Cancel</Button>
                <Button className="gap-2" onClick={handleMerge} disabled={merging || checkedCount === 0}>
                  {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                  {merging ? "Merging..." : "Merge & Download"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedContract && (
        <QuickShareDialog
          open={quickShareOpen}
          onClose={() => setQuickShareOpen(false)}
          contract={selectedContract}
        />
      )}
    </div>
  );
}
