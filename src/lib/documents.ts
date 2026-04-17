import type { TradeDocument } from "@/types/document";
import { saveFile, getFile, deleteFile, deleteFilesWithPrefix } from "./storage";

function metaKey(contractNo: string) {
  return `doc-meta-${contractNo}`;
}

function fileKey(contractNo: string, docId: string) {
  return `doc-file-${contractNo}-${docId}`;
}

/** Metadata stored in localStorage (small — no base64 data) */
export interface DocMeta {
  id: string;
  fileName: string;
  fileType: "pdf" | "image";
  mimeType: string;
  slot: import("@/types/document").DocSlot;
  category: import("@/types/document").DocumentCategory;
  confidence: number;
  extractedFields: import("@/types/document").ExtractedFields;
  validationResults: import("@/types/document").ValidationResult[];
  status: import("@/types/document").DocStatus;
  error?: string;
  addedAt: string;
}

function toMeta(doc: TradeDocument): DocMeta {
  const { base64Data: _, ...meta } = doc;
  return meta;
}

function toTradeDoc(meta: DocMeta, base64Data = ""): TradeDocument {
  return { ...meta, base64Data };
}

// ── Read/write metadata (localStorage) ──

export function getDocumentsMeta(contractNo: string): DocMeta[] {
  try {
    const raw = localStorage.getItem(metaKey(contractNo));
    if (!raw) return [];
    return JSON.parse(raw) as DocMeta[];
  } catch {
    return [];
  }
}

function saveDocumentsMeta(contractNo: string, metas: DocMeta[]): void {
  try {
    localStorage.setItem(metaKey(contractNo), JSON.stringify(metas));
  } catch {
    // localStorage for metadata should be small enough to always fit
  }
}

// ── Public API ──

/** Load all documents as TradeDocument[] (without base64Data — call getDocumentFile for that) */
export function getDocuments(contractNo: string): TradeDocument[] {
  return getDocumentsMeta(contractNo).map((m) => toTradeDoc(m));
}

/** Save a document: metadata → localStorage, file data → IndexedDB */
export async function saveDocument(contractNo: string, doc: TradeDocument): Promise<void> {
  // Save file data to IndexedDB
  if (doc.base64Data) {
    await saveFile(fileKey(contractNo, doc.id), doc.base64Data);
  }

  // Save metadata to localStorage (upsert)
  const metas = getDocumentsMeta(contractNo);
  const idx = metas.findIndex((m) => m.id === doc.id);
  const meta = toMeta(doc);
  if (idx >= 0) {
    metas[idx] = meta;
  } else {
    metas.push(meta);
  }
  saveDocumentsMeta(contractNo, metas);
}

/** Save all document metadata at once (for bulk updates like slot reassignment) */
export function saveDocumentsMetaBulk(contractNo: string, docs: TradeDocument[]): void {
  saveDocumentsMeta(contractNo, docs.map(toMeta));
}

/** Get the base64 file data for a specific document from IndexedDB */
export async function getDocumentFile(contractNo: string, docId: string): Promise<string> {
  return (await getFile(fileKey(contractNo, docId))) ?? "";
}

/** Remove a document: delete from both localStorage metadata and IndexedDB file */
export async function removeDocument(contractNo: string, docId: string): Promise<void> {
  const metas = getDocumentsMeta(contractNo).filter((m) => m.id !== docId);
  saveDocumentsMeta(contractNo, metas);
  await deleteFile(fileKey(contractNo, docId));
}

/** Remove all documents for a contract */
export async function clearDocuments(contractNo: string): Promise<void> {
  localStorage.removeItem(metaKey(contractNo));
  await deleteFilesWithPrefix(`doc-file-${contractNo}-`);
}

/** Compress an image to reduce storage size */
export function compressImage(base64: string, maxWidth = 1200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = base64;
  });
}

// ── One-time migration: move old base64 data from localStorage to IndexedDB ──

export async function migrateOldData(): Promise<void> {
  try {
    const keysToClean: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("documents-")) continue;
      const raw = localStorage.getItem(key);
      if (!raw || raw.length < 100_000) continue; // only migrate big entries

      try {
        const docs = JSON.parse(raw) as TradeDocument[];
        const contractNo = key.replace("documents-", "");
        for (const doc of docs) {
          if (doc.base64Data && doc.base64Data.length > 1000) {
            await saveFile(fileKey(contractNo, doc.id), doc.base64Data);
          }
        }
        // Re-save as metadata only
        saveDocumentsMeta(contractNo, docs.map(toMeta));
        keysToClean.push(key);
      } catch {
        // skip malformed entries
      }
    }
    for (const key of keysToClean) {
      localStorage.removeItem(key);
    }
  } catch {
    // migration is best-effort
  }
}
