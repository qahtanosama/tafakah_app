import { PDFDocument } from "pdf-lib";

export type MergeInput =
  | { source: "buffer"; data: Buffer; label: string }
  | { source: "url"; data: string; label: string };

export interface MergeResult {
  buffer: Buffer;
  pageCount: number;
  mergedCount: number;
  skipped: { label: string; reason: string }[];
}

/**
 * Merges a list of PDF inputs (in-memory buffers or remote URLs) into a single
 * PDF preserving the input order.
 *
 * Bad inputs (non-PDF bytes, fetch failures, encrypted-and-locked, etc.) are
 * skipped with a warning rather than aborting the whole merge — callers can
 * surface the `skipped` list in the UI.
 */
export async function mergePdfs(inputs: MergeInput[]): Promise<MergeResult> {
  const merged = await PDFDocument.create();
  let mergedCount = 0;
  const skipped: { label: string; reason: string }[] = [];

  for (const input of inputs) {
    try {
      let pdfBytes: Uint8Array;
      if (input.source === "buffer") {
        pdfBytes = new Uint8Array(input.data);
      } else {
        const res = await fetch(input.data);
        if (!res.ok) {
          const reason = `fetch failed (${res.status})`;
          console.warn(`[mergePdfs] Skip ${input.label}: ${reason}`);
          skipped.push({ label: input.label, reason });
          continue;
        }
        pdfBytes = new Uint8Array(await res.arrayBuffer());
      }
      const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const copied = await merged.copyPages(src, src.getPageIndices());
      copied.forEach((p) => merged.addPage(p));
      mergedCount++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[mergePdfs] Skip ${input.label}: ${reason}`);
      skipped.push({ label: input.label, reason });
    }
  }

  if (mergedCount === 0) {
    throw new Error("No documents were successfully merged");
  }

  const finalBytes = await merged.save();
  return {
    buffer: Buffer.from(finalBytes),
    pageCount: merged.getPageCount(),
    mergedCount,
    skipped,
  };
}
