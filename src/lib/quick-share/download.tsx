/**
 * Sequentially download the selected contract PDFs.
 *
 * Reuses the same @react-pdf/renderer components used by Master Data's
 * "Download All 4 PDFs" so we never diverge. Lazy-imports `@react-pdf/renderer`
 * and the PDF components to keep this helper tree-shake-friendly and SSR-safe.
 */

import type { ContractLogEntry } from "@/types/sales-contract";
import { calcTotals } from "@/lib/sales-contract";

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

function fileName(doc: QuickShareDoc, contractNo: string): string {
  if (doc === "sc") return `${contractNo}_SC.pdf`;
  if (doc === "ci") return `${contractNo}_CI.pdf`;
  if (doc === "ci-customs") return `${contractNo}_CI-Customs.pdf`;
  return `${contractNo}_PL.pdf`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download the selected PDFs for the given contract, sequentially with 250ms gaps.
 * Throws if rendering any document fails.
 */
export async function downloadContractPdfs(
  contract: ContractLogEntry,
  selectedDocs: QuickShareDoc[],
  options: { onProgress?: (doc: QuickShareDoc, index: number, total: number) => void } = {}
): Promise<void> {
  if (selectedDocs.length === 0) return;

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

  const data = contract.masterSnapshot;
  const totals = calcTotals(data.lineItems);
  const contractNo = contract.contractNo;
  const invoiceNo = contract.invoiceNo;

  const ordered = DOC_ORDER.filter((d) => selectedDocs.includes(d));

  for (let i = 0; i < ordered.length; i++) {
    const doc = ordered[i];
    options.onProgress?.(doc, i + 1, ordered.length);

    const element =
      doc === "sc"
        ? <SalesContractPDF data={data} totals={totals} contractNumber={contractNo} />
        : doc === "ci"
        ? <CommercialInvoicePDF data={data} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} />
        : doc === "ci-customs"
        ? <CommercialInvoicePDF data={data} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} priceFactor={0.55} />
        : <PackingListPDF data={data} totals={totals} contractNumber={contractNo} invoiceNumber={invoiceNo} />;

    const blob = await pdf(element).toBlob();
    triggerDownload(blob, fileName(doc, contractNo));
    if (i < ordered.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
