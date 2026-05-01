/**
 * Sequentially download the selected contract PDFs.
 *
 * On Chrome/Edge: prompts for a save location per file via File System Access API.
 * The next file's picker doesn't open until the previous file finishes writing.
 *
 * On unsupported browsers: falls back to a[download] with a 250ms stagger.
 *
 * Reuses the same @react-pdf/renderer components used by Master Data's
 * "Download All 4 PDFs" so we never diverge.
 */

import type { SalesContractData } from "@/types/sales-contract";
import { calcTotals } from "@/lib/sales-contract";
import { saveBlobWithDownload } from "./save-file";

export type QuickShareDoc = "sc" | "ci" | "ci-customs" | "pl";

export const DOC_LABELS: Record<QuickShareDoc, string> = {
  sc: "Sales Contract",
  ci: "Commercial Invoice",
  "ci-customs": "Customs Invoice",
  pl: "Packing List",
};

export const DOC_ORDER: QuickShareDoc[] = ["sc", "ci", "ci-customs", "pl"];

export const PRESET_DOCS: Record<"buyer" | "bank" | "customs" | "all", QuickShareDoc[]> = {
  buyer: ["sc", "ci", "pl"],
  bank: ["sc", "ci"],
  customs: ["ci-customs", "pl"],
  all: ["sc", "ci", "ci-customs", "pl"],
};

const FALLBACK_NOTICE_KEY = "download-fallback-notice-shown";

function fileName(doc: QuickShareDoc, contractNo: string): string {
  if (doc === "sc") return `${contractNo}_SC.pdf`;
  if (doc === "ci") return `${contractNo}_CI.pdf`;
  if (doc === "ci-customs") return `${contractNo}_CI-Customs.pdf`;
  return `${contractNo}_PL.pdf`;
}

function maybeShowFallbackNotice(onFallbackNotice?: (msg: string) => void): void {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(FALLBACK_NOTICE_KEY)) return;
  localStorage.setItem(FALLBACK_NOTICE_KEY, "1");
  const msg = "Your browser doesn't support save-location prompts. Files will save to your default Downloads folder.";
  if (onFallbackNotice) onFallbackNotice(msg);
  else if (typeof window !== "undefined") alert(msg);
}

export interface DownloadResult {
  saved: number;
  cancelled: boolean;
  method: "picker" | "download";
}

export interface DownloadOptions {
  onProgress?: (doc: QuickShareDoc, index: number, total: number) => void;
  /** Shown once (per browser) if the save-picker API is unavailable. Defaults to window.alert. */
  onFallbackNotice?: (message: string) => void;
}

/**
 * Download the selected PDFs for the given contract, strictly sequentially.
 *
 * Flow:
 * - Detects capability once.
 * - For each doc: render PDF, then await save (picker OR anchor-download).
 * - If the user cancels a picker, stops the loop and reports `cancelled: true`
 *   with the number saved so far.
 */
export async function downloadContractPdfs(
  contract: SalesContractData,
  contractNo: string,
  invoiceNo: string,
  selectedDocs: QuickShareDoc[],
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  if (selectedDocs.length === 0) {
    return { saved: 0, cancelled: false, method: "download" };
  }

  // Always anchor-download. showSaveFilePicker requires an unbroken user-gesture
  // context and the per-doc render pipeline (`pdf(...).toBlob()` + sequential
  // await loop) drops it before the picker can open.
  const method: DownloadResult["method"] = "download";
  maybeShowFallbackNotice(options.onFallbackNotice);

  const { pdf } = await import("@react-pdf/renderer");
  const [
    { default: SalesContractPDF },
    { default: CommercialInvoicePDF },
    { default: PackingListPDF },
  ] = await Promise.all([
    import("@/components/sales-contract/SalesContractPDF"),
    import("@/components/commercial-invoice/CommercialInvoicePDF"),
    import("@/components/packing-list/PackingListPDF"),
  ]);

  const totals = calcTotals(contract.lineItems, contract.terms?.numberOfContainers);

  const ordered = DOC_ORDER.filter((d) => selectedDocs.includes(d));

  let saved = 0;
  for (let i = 0; i < ordered.length; i++) {
    const doc = ordered[i];
    options.onProgress?.(doc, i + 1, ordered.length);

    const element =
      doc === "sc"
        ? <SalesContractPDF data={contract} totals={totals} contractNumber={contractNo} />
        : doc === "ci"
        ? <CommercialInvoicePDF data={contract} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} />
        : doc === "ci-customs"
        ? <CommercialInvoicePDF data={contract} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} priceFactor={0.55} />
        : <PackingListPDF data={contract} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} />;

    const blob = await pdf(element).toBlob();
    const name = fileName(doc, contractNo);

    await saveBlobWithDownload(blob, name);
    saved++;
    if (i < ordered.length - 1) {
      // Stagger so consecutive anchor-clicks don't get coalesced/blocked.
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return { saved, cancelled: false, method };
}
