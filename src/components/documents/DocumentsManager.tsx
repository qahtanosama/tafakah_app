"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ContractCombobox from "@/components/ui/contract-combobox";
import {
  FileX, Loader2, Settings, Upload, Trash2, Eye,
  CheckCircle, Clock, AlertTriangle, Package, X, ClipboardList,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { SalesContractData, ContractLogEntry } from "@/types/sales-contract";
import type { TradeDocument, AnalyzeRequest, AnalyzeResponse, DocSlot, DocumentCategory, ExtractedFields, ValidationResult } from "@/types/document";
import { RECEIVED_SLOTS, SLOT_LABELS, CATEGORY_LABELS, categoryToSlot } from "@/types/document";
import { calcTotals } from "@/lib/sales-contract";
import { compressImage } from "@/lib/documents";
import { finalizeCertUpload, deleteCertificate } from "@/lib/contracts/upload-cert";
import { CONTRACT_DOCUMENTS_BUCKET, MAX_CERT_SIZE_BYTES, buildCertStoragePath } from "@/lib/contracts/cert-storage";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { listCertsForContract, type CertRow } from "@/lib/contracts/list-certs";
import { getActiveProviderKey } from "@/lib/settings";
import { mergeDocuments } from "@/lib/pdf-merge";
import { getStatusInfo } from "@/lib/shipping";
import { useContracts, useContract, useSetCertRef, useClearCertRef } from "@/lib/data/contracts";
import { buildContractDocumentData } from "@/lib/contracts/document-data";
import { useShipping, shippingRowToEntry } from "@/lib/data/shipping";
import { saveBlobWithDownload } from "@/lib/quick-share/save-file";
import QuickShareDialog, { QuickShareButton } from "@/components/quick-share/QuickShareDialog";
import type { RequiredCert } from "@/types/workflow";
import StageStrip from "@/components/workflow/StageStrip";
import UploadZone from "./UploadZone";

// Per-document download wrappers — reused verbatim (same PDF generation +
// save/picker logic the View pages use); rendered here in compact icon mode.
const SalesContractPDFDownload = dynamic(() => import("@/components/sales-contract/SalesContractPDFDownload"), { ssr: false });
const CommercialInvoicePDFDownload = dynamic(() => import("@/components/commercial-invoice/CommercialInvoicePDFDownload"), { ssr: false });
const PackingListPDFDownload = dynamic(() => import("@/components/packing-list/PackingListPDFDownload"), { ssr: false });
const FreightInvoicePDFDownload = dynamic(() => import("@/components/freight-invoice/FreightInvoicePDFDownload"), { ssr: false });

/* ── Cert slot mapping ──────────────────────────────── */
const CERT_SLOT_MAP: Partial<Record<DocSlot, RequiredCert>> = {
  certificate_of_origin: "co",
  health_certificate: "health",
  phytosanitary_certificate: "phyto",
};

function certTypeForSlot(slot: DocSlot): RequiredCert | null {
  return CERT_SLOT_MAP[slot] ?? null;
}

/** UI slot ↔ Storage `doc_type` mapping. */
type StorageDocType = "co" | "bl" | "phyto" | "health" | "other";
const SLOT_TO_DOC_TYPE: Record<DocSlot, StorageDocType> = {
  certificate_of_origin: "co",
  bill_of_lading: "bl",
  phytosanitary_certificate: "phyto",
  health_certificate: "health",
  other: "other",
};
const DOC_TYPE_TO_SLOT: Partial<Record<string, DocSlot>> = {
  co: "certificate_of_origin",
  bl: "bill_of_lading",
  phyto: "phytosanitary_certificate",
  health: "health_certificate",
  other: "other",
};

function certRowToTradeDoc(row: CertRow): TradeDocument {
  const slot: DocSlot = DOC_TYPE_TO_SLOT[row.doc_type] ?? "other";
  const ai = (row.ai_metadata ?? {}) as Partial<{
    category: DocumentCategory;
    confidence: number;
    extractedFields: ExtractedFields;
    validationResults: ValidationResult[];
  }>;
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: (row.mime_type ?? "").startsWith("image/") ? "image" : "pdf",
    mimeType: row.mime_type ?? "application/octet-stream",
    base64Data: "",
    slot,
    category: ai.category ?? (slot === "other" ? "other" : "unknown"),
    confidence: ai.confidence ?? 0,
    extractedFields: ai.extractedFields ?? {},
    validationResults: ai.validationResults ?? [],
    status: "ready",
    addedAt: row.created_at,
  };
}

/** Files above this skip the AI pass — too big to inline into the analysis request. */
const ANALYZE_MAX_BYTES = 15 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

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
          {i > 0 && <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">&rarr;</span>}
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 ${
            i === 3 ? "bg-emerald-100 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : i < 3 ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-400 dark:text-zinc-500"
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
  const { data: contractsData } = useContracts();
  const contracts = useMemo(() => contractsData ?? [], [contractsData]);
  const loaded = contractsData !== undefined;
  const setCertMut = useSetCertRef();
  const clearCertMut = useClearCertRef();
  const searchParams = useSearchParams();
  const [selectedContractNo, setSelectedContractNo] = useState<string>("");
  const [dbContractId, setDbContractId] = useState<string | null>(null);
  const [docs, setDocs] = useState<TradeDocument[]>([]);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState("");
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeChecks, setMergeChecks] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [providerInfo, setProviderInfo] = useState<{ provider: string; hasKey: boolean }>({ provider: "gemini", hasKey: false });
  const [quickShareOpen, setQuickShareOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<DocSlot | null>(null);

  // Derived: selected contract entry (slim list row — combobox/id resolution).
  const selectedContract = useMemo(
    () => contracts.find((c) => c.contract_no === selectedContractNo),
    [contracts, selectedContractNo]
  );
  // The list no longer carries the full master_snapshot (bank details, seller
  // stamp, identifiers) — fetch the selected contract's complete row for the
  // PDF builders and Quick Share.
  const { data: fullContract } = useContract(selectedContract?.id);
  // Shared builder — the SAME data/totals the portal route feeds the PDFs, so
  // the team download/merge and the portal copy are byte-identical.
  const built = useMemo(
    () => (fullContract ? buildContractDocumentData(fullContract) : null),
    [fullContract]
  );
  const contractData = built?.data;
  const totals = built?.totals ?? null;
  const contractNo = selectedContract?.contract_no ?? "";
  const invoiceNo = selectedContract?.invoice_no ?? "";
  const { data: shippingRow } = useShipping(dbContractId ?? undefined);

  // Reload the cert list for a given contract from Supabase. Stores the
  // resolved DB UUID so subsequent uploads/deletes can address the row.
  const refetchDocs = useCallback(async (contractNo: string) => {
    if (!contractNo) {
      setDocs([]);
      setDbContractId(null);
      setDocsError(null);
      return;
    }
    const result = await listCertsForContract({ contractNo });
    if (!result.ok) {
      setDocs([]);
      setDbContractId(null);
      setDocsError(result.error);
      return;
    }
    setDbContractId(result.contractId);
    setDocs(result.rows.map(certRowToTradeDoc));
    setDocsError(null);
  }, []);

  // Provider info (once).
  useEffect(() => {
    const pk = getActiveProviderKey();
    setProviderInfo({ provider: pk.provider, hasKey: !!pk.apiKey });
  }, []);

  // Pick the initial contract once contracts load — from ?id (deep-link from
  // Contract Log) or the most recent contract.
  useEffect(() => {
    if (contracts.length === 0 || selectedContractNo) return;
    const idParam = searchParams?.get("id");
    const byId = idParam ? contracts.find((c) => c.id === idParam) : undefined;
    setSelectedContractNo(byId?.contract_no ?? contracts[0]?.contract_no ?? "");
  }, [contracts, selectedContractNo, searchParams]);

  // Reload the cert list whenever the selection changes.
  useEffect(() => {
    if (selectedContractNo) void refetchDocs(selectedContractNo);
  }, [selectedContractNo, refetchDocs]);

  // When selected contract changes via the picker, reload docs from Supabase.
  const switchContract = useCallback((newContractNo: string) => {
    setSelectedContractNo(newContractNo);
    void refetchDocs(newContractNo);
  }, [refetchDocs]);

  const showToastMsg = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── File processing ──
  const processFile = useCallback(async (file: File, targetSlot?: DocSlot) => {
    if (!contractData || !contractNo) return;
    if (!dbContractId) {
      showToastMsg("error", docsError ?? "Contract not yet synced to the cloud \u2014 open Admin \u2192 Migrate first.");
      return;
    }
    if (file.size > MAX_CERT_SIZE_BYTES) {
      showToastMsg("error", `"${file.name}" is too large (max 50 MB).`);
      return;
    }
    const isImage = file.type.startsWith("image/");
    const tempId = crypto.randomUUID();
    const optimistic: TradeDocument = {
      id: tempId, fileName: file.name, fileType: isImage ? "image" : "pdf",
      mimeType: file.type, base64Data: "", slot: targetSlot ?? "other", category: "unknown",
      confidence: 0, extractedFields: {}, validationResults: [], status: "uploading",
      addedAt: new Date().toISOString(),
    };
    setDocs((prev) => {
      const filtered = targetSlot && targetSlot !== "other" ? prev.filter((d) => d.slot !== targetSlot) : prev;
      return [...filtered, optimistic];
    });
    try {
      // Images get recompressed before upload; everything else uploads as-is.
      // The AI pass needs base64, so oversized non-image files skip it (the
      // upload itself never depends on analysis).
      let uploadBlob: Blob = file;
      let mimeType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
      let base64DataUrl: string | null = null;
      if (isImage) {
        base64DataUrl = await compressImage(await readFileAsDataUrl(file));
        uploadBlob = await (await fetch(base64DataUrl)).blob();
        if (uploadBlob.type) mimeType = uploadBlob.type;
      } else if (file.size <= ANALYZE_MAX_BYTES) {
        base64DataUrl = await readFileAsDataUrl(file);
      }
      setDocs((prev) => prev.map((d) => (d.id === tempId ? { ...d, base64Data: base64DataUrl ?? "", status: "analyzing" } : d)));

      const pk = getActiveProviderKey();
      const t = calcTotals(contractData.lineItems, contractData.terms?.numberOfContainers);
      const reqBody: AnalyzeRequest = {
        provider: pk.provider, apiKey: pk.apiKey, fileBase64: base64DataUrl ?? "", fileName: file.name, mimeType: file.type,
        masterData: {
          contractNo, buyer: contractData.buyer.company, origin: contractData.shipping.origin,
          loadingPort: contractData.shipping.loadingPort, dischargePort: contractData.shipping.dischargePort,
          containerNumber: contractData.identifiers.containerNumber,
          products: contractData.lineItems.filter((i) => i.product).map((i) => i.product),
          hsCodes: contractData.lineItems.filter((i) => i.hsCode).map((i) => i.hsCode),
          totalNetWeight: t.totalNetWeight, totalGrossWeight: t.totalGrossWeight,
        },
      };
      let analysis: AnalyzeResponse | null = null;
      if (base64DataUrl) {
        try {
          const res = await fetch("/api/analyze-document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqBody) });
          if (!res.ok) throw new Error("Analysis API returned " + res.status);
          analysis = await res.json();
        } catch (err) {
          // AI is best-effort. Keep going so the upload still succeeds.
          console.warn("[documents] analysis failed, continuing without metadata:", err);
        }
      }

      const finalSlot: DocSlot = targetSlot ?? (analysis ? categoryToSlot(analysis.category) : "other");
      const docType = SLOT_TO_DOC_TYPE[finalSlot];
      const aiMetadata = analysis
        ? {
            category: analysis.category,
            confidence: analysis.confidence,
            extractedFields: analysis.extractedFields,
            validationResults: analysis.validationResults,
          }
        : null;

      // Upload straight from the browser to Storage (team-only RLS write
      // policy) so the file never rides inside a size-limited Server Action
      // body; the action below only registers the metadata row.
      const storagePath = buildCertStoragePath(dbContractId, docType, file.name, mimeType);
      const supabase = createBrowserClient();
      const { error: storageError } = await supabase.storage
        .from(CONTRACT_DOCUMENTS_BUCKET)
        .upload(storagePath, uploadBlob, { contentType: mimeType, upsert: false });
      if (storageError) throw new Error(`Upload failed: ${storageError.message}`);

      const upload = await finalizeCertUpload({
        contractId: dbContractId,
        docType,
        storagePath,
        fileName: file.name,
        mimeType,
        sizeBytes: uploadBlob.size,
        aiMetadata,
      });
      if (!upload.ok) throw new Error(upload.error);

      // Refresh from source of truth (handles archived predecessors etc.)
      await refetchDocs(contractNo);

      if (!targetSlot && analysis && finalSlot !== "other") {
        showToastMsg("success", `Detected as ${SLOT_LABELS[finalSlot]} \u2014 assigned automatically`);
      }

      const certType = certTypeForSlot(finalSlot);
      if (certType && dbContractId) {
        setCertMut.mutate({
          contractId: dbContractId,
          certType,
          ref: {
            docId: upload.documentId,
            uploadedAt: new Date().toISOString(),
            fileName: file.name,
            fileSize: file.size,
          },
        });
      }
    } catch (err) {
      const message = (err as Error).message || "Upload failed";
      setDocs((prev) => prev.map((d) => (d.id === tempId ? { ...d, status: "error", error: message } : d)));
      showToastMsg("error", message);
    }
  }, [contractData, contractNo, dbContractId, docsError, refetchDocs, setCertMut, showToastMsg]);

  const handleGeneralDrop = useCallback((files: File[]) => { for (const file of files) processFile(file); }, [processFile]);
  const handleSlotUpload = useCallback((slot: DocSlot) => { pendingSlotRef.current = slot; fileInputRef.current?.click(); }, []);
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    processFile(file, pendingSlotRef.current ?? undefined); pendingSlotRef.current = null; e.target.value = "";
  }, [processFile]);
  const handleRemove = useCallback(async (id: string) => {
    if (!contractNo) return;
    const removed = docs.find((d) => d.id === id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
    const result = await deleteCertificate(id);
    if (!result.ok) {
      showToastMsg("error", result.error);
      // Refetch to restore on failure.
      await refetchDocs(contractNo);
      return;
    }
    if (removed && dbContractId) {
      const certType = certTypeForSlot(removed.slot);
      if (certType) clearCertMut.mutate({ contractId: dbContractId, certType });
    }
  }, [contractNo, docs, refetchDocs, dbContractId, clearCertMut, showToastMsg]);

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

    // Open the save-location picker BEFORE any other await so the user-gesture
    // context survives. If the user cancels, abort silently. If the picker
    // isn't supported (Safari/Firefox) or errors for any other reason, we'll
    // fall back to the classic anchor download after the merge completes.
    const filename = `${contractNo}-shipment-package.pdf`;
    let fileHandle: FileSystemFileHandle | null = null;
    if (typeof window !== "undefined" && window.showSaveFilePicker) {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "PDF Document", accept: { "application/pdf": [".pdf"] } }],
        });
      } catch (err) {
        // AbortError = user cancelled. Surface nothing and bail.
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message))) return;
        // Any other picker failure: fall through to anchor download.
        fileHandle = null;
      }
    }

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
          const docMeta = docs.find((d) => d.id === item.docId);
          if (!docMeta) continue;
          const res = await fetch(`/api/cert/download?documentId=${encodeURIComponent(item.docId)}`, { credentials: "include" });
          if (!res.ok) {
            console.warn(`[merge] skip ${item.label}: download returned ${res.status}`);
            continue;
          }
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const mime = res.headers.get("Content-Type") || docMeta.mimeType || "application/pdf";
          const dataUrl = `data:${mime};base64,${btoa(binary)}`;
          allDocs.push({ ...docMeta, base64Data: dataUrl, mimeType: mime });
        }
      }

      setMergeProgress("Merging all documents...");
      const merged = await mergeDocuments(allDocs);
      const blob = new Blob([merged.buffer as ArrayBuffer], { type: "application/pdf" });

      if (fileHandle) {
        setMergeProgress("Saving to chosen location\u2026");
        const writable = await fileHandle.createWritable();
        try {
          await writable.write(blob);
        } finally {
          await writable.close();
        }
        showToastMsg("success", "Shipment package saved!");
      } else {
        // Fallback for Safari/Firefox/iOS or when the picker errored.
        await saveBlobWithDownload(blob, filename);
        showToastMsg("success", "Shipment package downloaded!");
      }
      setShowMergeModal(false);
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
      <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif" onChange={handleFileInput} />

      {toast && (
        <div role={toast.type === "error" ? "alert" : "status"} className={`fixed top-4 right-4 z-50 rounded-lg px-5 py-3 text-sm font-medium shadow-lg ${
          toast.type === "success"
            ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
            : "border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        }`}>{toast.message}</div>
      )}

      {/* ═══ CONTRACT SWITCHER ═══ */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3 dark:bg-zinc-900">
        <ClipboardList className="h-5 w-5 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-600">Working on:</span>
        <ContractCombobox
          contracts={contracts
            .map((c) => ({
              contractNo: c.contract_no,
              invoiceNo: c.invoice_no,
              buyer: c.master_snapshot?.buyer?.company ?? "—",
              status: c.status,
            }))
            .reverse()}
          value={selectedContractNo}
          onChange={switchContract}
        />
        {selectedContract && (
          <QuickShareButton size="sm" label="Quick Share" onClick={() => setQuickShareOpen(true)} />
        )}
        {selectedContract && (() => {
          const sh = shippingRow ? shippingRowToEntry(selectedContract.contract_no, shippingRow) : null;
          const info = getStatusInfo(sh);
          return (
            <Link
              href={`/shipping/${encodeURIComponent(selectedContract.contract_no)}`}
              className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:opacity-80 ${info.badgeColor}`}
              title="Shipping details"
            >
              {info.icon} {info.label}
              {info.daysLabel !== "\u2014" && <span className="text-[11px] font-normal opacity-80">&middot; {info.daysLabel}</span>}
            </Link>
          );
        })()}
      </div>

      {docsError && contractNo && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Couldn&rsquo;t load documents:</strong> {docsError}
          </div>
        </div>
      )}
      {!contractData ? (
        <p className="py-10 text-center text-zinc-400">Select a contract above.</p>
      ) : (
        <>
          {/* Workflow stage tracker */}
          {selectedContract && (
            <div className="rounded-lg border bg-white p-4 dark:bg-zinc-900">
              <p className="mb-3 text-sm font-semibold text-zinc-600">Workflow</p>
              <StageStrip contractId={selectedContract.id} />
            </div>
          )}

          <Timeline />

          {/* Progress bar */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-zinc-500">Shipment Package: {totalReady} of {totalExpected} documents ready</span>
              <span className="font-medium">{progressPct}%</span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct} aria-label="Shipment package completeness" className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
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
                {
                  label: "Sales Contract",
                  href: `/sales-contract?id=${selectedContract?.id}`,
                  download: <SalesContractPDFDownload compact data={contractData} totals={totals!} contractNumber={contractNo} />,
                },
                {
                  label: "Commercial Invoice",
                  href: `/commercial-invoice?id=${selectedContract?.id}`,
                  download: <CommercialInvoicePDFDownload compact data={contractData} totals={totals!} contractNumber={contractNo} invoiceNumber={invoiceNo} />,
                },
                {
                  label: "Customs Invoice",
                  href: `/customs-invoice?id=${selectedContract?.id}`,
                  note: "Internal use only",
                  // Customs = Commercial Invoice at the 0.55 price factor (matches InvoiceForm).
                  download: <CommercialInvoicePDFDownload compact data={contractData} totals={totals!} contractNumber={contractNo} invoiceNumber={invoiceNo} priceFactor={0.55} filenamePrefix="CI-Customs" />,
                },
                {
                  label: "Packing List",
                  href: `/packing-list?id=${selectedContract?.id}`,
                  download: <PackingListPDFDownload compact data={contractData} totals={totals!} contractNumber={contractNo} invoiceNumber={invoiceNo} />,
                },
                // Freight Invoice row — FOB only, same gate as its View link.
                ...((selectedContract?.master_snapshot?.shipping?.incoterm ?? "").trim().toUpperCase().startsWith("FOB")
                  ? [{
                      label: "Freight Invoice",
                      href: `/freight-invoice?id=${selectedContract?.id}`,
                      note: "FOB only",
                      download: (
                        <FreightInvoicePDFDownload
                          compact
                          data={contractData}
                          invoiceNumber={`${invoiceNo}-FRT`}
                          contractNumber={contractNo}
                          freightBase={shippingRow?.freight_base ?? 0}
                          freightAdditional={shippingRow?.freight_additional ?? 0}
                          freightChargeLabel={shippingRow?.freight_charge_label ?? ""}
                          freightInvoiceDate={shippingRow?.freight_invoice_date ?? ""}
                          freightNotes={shippingRow?.freight_notes ?? ""}
                          loadingPort={shippingRow?.port_of_loading || contractData.shipping?.loadingPort || ""}
                          dischargePort={shippingRow?.port_of_discharge || contractData.shipping?.dischargePort || ""}
                          containers={selectedContract?.containers ?? []}
                        />
                      ),
                    }]
                  : []),
              ].map((d) => (
                <div key={d.label} className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 dark:bg-zinc-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <div>
                      <span className="text-sm font-medium">{d.label}</span>
                      {d.note && <span className="ml-2 text-xs text-zinc-400">({d.note})</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.download}
                    <Link href={d.href}><Button variant="outline" size="sm" className="gap-1"><Eye className="h-3 w-3" /> View</Button></Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ SECTION B: Received Documents ═══ */}
          <div>
            <h2 className="mb-3 text-lg font-bold">Received Documents</h2>
            <div className="mb-4">
              <UploadZone onFiles={handleGeneralDrop} onRejected={(message) => showToastMsg("error", message)} />
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
                    <Button variant="ghost" size="icon" aria-label={`Remove ${doc.fileName}`} onClick={() => handleRemove(doc.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
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
          <div role="dialog" aria-modal="true" aria-label="Create Shipment Package" className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Create Shipment Package</h3>
              <button aria-label="Close" onClick={() => setShowMergeModal(false)} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
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

      {fullContract && fullContract.master_snapshot && (
        <QuickShareDialog
          open={quickShareOpen}
          onClose={() => setQuickShareOpen(false)}
          contract={{
            id: fullContract.id,
            contractNo: fullContract.contract_no,
            invoiceNo: fullContract.invoice_no,
            dateSubmitted: fullContract.created_at,
            buyer: fullContract.master_snapshot.buyer?.company ?? "",
            product: fullContract.product_label ?? "",
            status: fullContract.status,
            masterSnapshot: {
              ...fullContract.master_snapshot,
              blNumber: fullContract.bl_number,
              containers: fullContract.containers ?? [],
            },
            sellerId: fullContract.master_snapshot.sellerId,
          } as ContractLogEntry}
        />
      )}
    </div>
  );
}
