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
 * Loads an uploaded PDF tolerantly, then re-serializes it to a clean,
 * self-consistent byte stream and reloads it.
 *
 * Why the round-trip: pdf-lib's `copyPages` resolves a source's indirect objects
 * *lazily*, so a malformed scan (common with scanner / "print to PDF" output and
 * password-less encrypted certs) often copies without error but only blows up at
 * the final merged `save()` — which is outside the per-file guard and would crash
 * the entire merge. Re-saving forces every object to resolve here, where a parse
 * failure is caught per-file and the document is skipped. `useObjectStreams:false`
 * maximizes compatibility with that malformed output.
 */
async function loadUploadedPdf(bytes: Uint8Array): Promise<PDFDocument> {
  const initial = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const normalized = await initial.save({ useObjectStreams: false });
  return PDFDocument.load(normalized, { ignoreEncryption: true });
}

/**
 * Merges a list of PDF inputs (in-memory buffers or remote URLs) into a single
 * PDF preserving the input order.
 *
 * Bad inputs (non-PDF bytes, fetch failures, encrypted-and-locked, malformed
 * scans, etc.) are skipped with a warning rather than aborting the whole merge —
 * callers can surface the `skipped` list in the UI.
 */
export async function mergePdfs(inputs: MergeInput[]): Promise<MergeResult> {
  const merged = await PDFDocument.create();
  let mergedCount = 0;
  const skipped: { label: string; reason: string }[] = [];

  for (const input of inputs) {
    try {
      let src: PDFDocument;
      if (input.source === "buffer") {
        // Freshly generated, already-clean docs (SC/CI/PL/…) — merge unchanged.
        src = await PDFDocument.load(new Uint8Array(input.data), { ignoreEncryption: true });
      } else {
        const res = await fetch(input.data);
        if (!res.ok) {
          const reason = `fetch failed (${res.status})`;
          console.warn(`[mergePdfs] Skip ${input.label}: ${reason}`);
          skipped.push({ label: input.label, reason });
          continue;
        }
        // Uploaded certificate — normalize before merging so a malformed scan is
        // caught here (and skipped) instead of crashing the final save().
        src = await loadUploadedPdf(new Uint8Array(await res.arrayBuffer()));
      }
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
