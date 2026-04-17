import type { TradeDocument } from "@/types/document";

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function mergeDocuments(docs: TradeDocument[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();

  for (const doc of docs) {
    const raw = base64ToUint8Array(doc.base64Data);

    if (doc.fileType === "pdf") {
      const src = await PDFDocument.load(raw, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } else {
      // Image → PDF page
      const isJpeg =
        doc.fileName.toLowerCase().endsWith(".jpg") ||
        doc.fileName.toLowerCase().endsWith(".jpeg") ||
        doc.base64Data.startsWith("data:image/jpeg");

      const img = isJpeg
        ? await merged.embedJpg(raw)
        : await merged.embedPng(raw);

      // A4 dimensions in points
      const A4_W = 595.28;
      const A4_H = 841.89;
      const page = merged.addPage([A4_W, A4_H]);

      // Scale image to fit within A4 with 20pt margins
      const maxW = A4_W - 40;
      const maxH = A4_H - 40;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;

      page.drawImage(img, {
        x: (A4_W - w) / 2,
        y: (A4_H - h) / 2,
        width: w,
        height: h,
      });
    }
  }

  return merged.save();
}
