import { openDB } from "idb";
import type { ProductProfile } from "@/types/product";
import type { Buyer } from "@/types/buyer";
import type { Seller } from "@/types/seller";
import type { ContractLogEntry, ActiveContract } from "@/types/sales-contract";
import type { ContractFinance } from "@/types/finance";
import type { ShippingEntry } from "@/types/shipping";
import type { DocMeta } from "@/lib/documents";

export interface LocalDocRef {
  contractNo: string;
  docId: string;
  slot: string;
  docType: "co" | "health" | "phyto" | "bl" | "other";
  fileName: string;
  fileSize: number;
  uploadedAt: string;
}

function safeParseArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch (err) {
    console.warn(`[migration] failed to parse ${key}:`, err);
    return [];
  }
}

function safeParseObject<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[migration] failed to parse ${key}:`, err);
    return null;
  }
}

export function readProducts(): ProductProfile[] {
  return safeParseArray<ProductProfile>("products-database");
}

export function readBuyers(): Buyer[] {
  return safeParseArray<Buyer>("buyers-database");
}

export function readSellers(): Seller[] {
  return safeParseArray<Seller>("sellers-database");
}

/**
 * Returns every logged contract plus the currently-active contract
 * (synthesized as a log-entry-shaped record if not already present).
 * Deduped by contract_no.
 */
export function readContracts(): ContractLogEntry[] {
  const log = safeParseArray<ContractLogEntry>("contract-log");
  const active = safeParseObject<ActiveContract>("active-submitted-contract");
  const seen = new Set(log.map((e) => e.contractNo));
  if (active && active.contractNo && !seen.has(active.contractNo)) {
    log.push({
      id: active.contractNo, // synthetic local id — will be mapped to the inserted uuid
      contractNo: active.contractNo,
      invoiceNo: active.invoiceNo ?? "",
      dateSubmitted: active.dateSubmitted ?? new Date().toISOString(),
      buyer: active.data?.buyer?.company ?? "",
      product: active.data?.lineItems?.[0]?.product ?? "",
      status: "Active",
      masterSnapshot: active.data,
      sellerId: active.data?.sellerId,
      workflow: active.data?.workflow,
    });
  }
  return log;
}

export function readContractFinance(): ContractFinance[] {
  return safeParseArray<ContractFinance>("contract-finance");
}

export function readContractShipping(): ShippingEntry[] {
  return safeParseArray<ShippingEntry>("shipping-tracker");
}

/** Slot (localStorage) → doc_type (DB). */
function slotToDocType(slot: string): LocalDocRef["docType"] {
  switch (slot) {
    case "certificate_of_origin": return "co";
    case "health_certificate": return "health";
    case "phytosanitary_certificate": return "phyto";
    case "bill_of_lading": return "bl";
    default: return "other";
  }
}

/**
 * Walk every `doc-meta-*` localStorage key and build doc-reference records.
 * Blob migration is a later phase — only metadata is returned here.
 */
export async function readContractDocumentRefs(): Promise<LocalDocRef[]> {
  const out: LocalDocRef[] = [];
  if (typeof localStorage === "undefined") return out;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("doc-meta-")) continue;
    const contractNo = key.slice("doc-meta-".length);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const list = JSON.parse(raw) as DocMeta[];
      if (!Array.isArray(list)) continue;
      for (const d of list) {
        out.push({
          contractNo,
          docId: d.id,
          slot: d.slot,
          docType: slotToDocType(d.slot),
          fileName: d.fileName,
          fileSize: 0, // will be computed from IndexedDB below if present
          uploadedAt: d.addedAt,
        });
      }
    } catch (err) {
      console.warn(`[migration] failed to parse ${key}:`, err);
    }
  }

  // Try to compute fileSize from IndexedDB blobs
  try {
    const db = await openDB("tafakah-documents", 1);
    for (const ref of out) {
      const fileKey = `doc-file-${ref.contractNo}-${ref.docId}`;
      const value = await db.get("files", fileKey);
      if (typeof value === "string") {
        // value is a data URL; approximate bytes = base64 length * 3/4
        const commaIdx = value.indexOf(",");
        const body = commaIdx >= 0 ? value.slice(commaIdx + 1) : value;
        const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
        ref.fileSize = Math.max(0, Math.floor((body.length * 3) / 4) - padding);
      }
    }
  } catch {
    // IndexedDB may not be available; fileSize stays 0
  }

  return out;
}
