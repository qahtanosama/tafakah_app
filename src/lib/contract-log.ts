import type { ContractLogEntry, ContractStatus } from "@/types/sales-contract";
import { triggerBackgroundSync } from "@/lib/sync";

const STORAGE_KEY = "contract-log";
const SEQUENCE_START = 7001;

export function getContractLog(): ContractLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ContractLogEntry[];
  } catch {
    return [];
  }
}

export function saveContractLog(log: ContractLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    triggerBackgroundSync();
  } catch {
    // localStorage full or unavailable
  }
}

export function addContractLogEntry(entry: ContractLogEntry): void {
  const log = getContractLog();
  log.push(entry);
  saveContractLog(log);
}

export function deleteContractLogEntry(id: string): void {
  const log = getContractLog().filter((e) => e.id !== id);
  saveContractLog(log);
}

export function updateContractLogEntryStatus(id: string, status: ContractStatus): void {
  const log = getContractLog().map((e) =>
    e.id === id ? { ...e, status } : e
  );
  saveContractLog(log);
}

export function updateContractLogEntry(id: string, updates: Partial<ContractLogEntry>): ContractLogEntry | null {
  const log = getContractLog();
  const idx = log.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  log[idx] = { ...log[idx], ...updates };
  saveContractLog(log);
  return log[idx];
}

export function contractNoExists(contractNo: string, excludeContractNo?: string): boolean {
  return getContractLog().some(
    (e) => e.contractNo === contractNo && e.contractNo !== excludeContractNo
  );
}

export function getNextSequence(year: number, prefix: string): number {
  if (!prefix) return 0;
  const log = getContractLog();
  let maxSeq = 0;

  for (const entry of log) {
    // Parse contract number: "YYYY-PREFIXseq"
    const match = entry.contractNo.match(/^(\d{4})-([A-Z]+)(\d+)$/);
    if (!match) continue;
    const entryYear = parseInt(match[1], 10);
    const entryPrefix = match[2];
    const entrySeq = parseInt(match[3], 10);
    if (entryYear === year && entryPrefix === prefix) {
      maxSeq = Math.max(maxSeq, entrySeq);
    }
  }

  return maxSeq > 0 ? maxSeq + 1 : SEQUENCE_START;
}
