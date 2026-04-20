import { saveFile, getFile, deleteFilesWithPrefix } from "./storage";
import { openDB } from "idb";

const BACKUP_VERSION = 1;

interface BackupData {
  version: number;
  createdAt: string;
  localStorage: Record<string, string>;
  indexedDBFiles: Record<string, string>;
}

export async function exportBackup(): Promise<{ json: string; stats: { contracts: number; buyers: number; products: number; documents: number; shipments: number } }> {
  // Collect localStorage
  const lsData: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) lsData[key] = localStorage.getItem(key) ?? "";
  }

  // Collect IndexedDB files
  const idbData: Record<string, string> = {};
  try {
    const db = await openDB("tafakah-documents", 1);
    const keys = await db.getAllKeys("files");
    for (const key of keys) {
      const val = await db.get("files", key);
      if (val) idbData[String(key)] = val;
    }
  } catch { /* no IndexedDB data */ }

  const backup: BackupData = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    localStorage: lsData,
    indexedDBFiles: idbData,
  };

  // Stats
  let contracts = 0, buyers = 0, products = 0, documents = 0, shipments = 0;
  try { contracts = JSON.parse(lsData["contract-log"] ?? "[]").length; } catch {}
  try { buyers = JSON.parse(lsData["buyers-database"] ?? "[]").length; } catch {}
  try { products = JSON.parse(lsData["products-database"] ?? "[]").length; } catch {}
  try { shipments = JSON.parse(lsData["shipping-tracker"] ?? "[]").length; } catch {}
  documents = Object.keys(idbData).length;

  return { json: JSON.stringify(backup), stats: { contracts, buyers, products, documents, shipments } };
}

export function parseBackup(json: string): { data: BackupData; stats: { contracts: number; buyers: number; products: number; documents: number; shipments: number } } | null {
  try {
    const data = JSON.parse(json) as BackupData;
    if (!data.version || !data.localStorage) return null;

    let contracts = 0, buyers = 0, products = 0, documents = 0, shipments = 0;
    try { contracts = JSON.parse(data.localStorage["contract-log"] ?? "[]").length; } catch {}
    try { buyers = JSON.parse(data.localStorage["buyers-database"] ?? "[]").length; } catch {}
    try { products = JSON.parse(data.localStorage["products-database"] ?? "[]").length; } catch {}
    try { shipments = JSON.parse(data.localStorage["shipping-tracker"] ?? "[]").length; } catch {}
    documents = Object.keys(data.indexedDBFiles ?? {}).length;

    return { data, stats: { contracts, buyers, products, documents, shipments } };
  } catch {
    return null;
  }
}

export async function restoreBackup(data: BackupData): Promise<void> {
  // Clear existing data
  localStorage.clear();

  // Restore localStorage
  for (const [key, value] of Object.entries(data.localStorage)) {
    localStorage.setItem(key, value);
  }

  // Restore IndexedDB
  if (data.indexedDBFiles) {
    await deleteFilesWithPrefix("doc-");
    for (const [key, value] of Object.entries(data.indexedDBFiles)) {
      await saveFile(key, value);
    }
  }
}

export async function clearAllData(): Promise<void> {
  localStorage.clear();
  try {
    await deleteFilesWithPrefix("");
  } catch { /* ignore */ }
}

export function getStorageStats(): { lsUsed: string; lsTotal: string; idbDocs: number } {
  let lsBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) lsBytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
  }
  const lsUsed = (lsBytes / 1024 / 1024).toFixed(1);

  let idbDocs = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("doc-meta-")) {
      try { idbDocs += JSON.parse(localStorage.getItem(key) ?? "[]").length; } catch {}
    }
  }

  return { lsUsed: `${lsUsed} MB`, lsTotal: "5 MB", idbDocs };
}
