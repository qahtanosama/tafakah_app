"use client";

import { openDB, type IDBPDatabase } from "idb";

export type QueuedEntity =
  | "products" | "buyers" | "sellers"
  | "contracts" | "contract_finance" | "contract_shipping" | "contract_documents"
  | "users_profile";

export type QueuedOperation = "insert" | "update" | "delete";

export interface QueuedWrite {
  id: string;
  entity: QueuedEntity;
  operation: QueuedOperation;
  payload: unknown;
  idempotencyKey: string;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
  createdAt: number;
  originPath?: string;
  /** After MAX_ATTEMPTS, marked permanent so the UI can surface it */
  status?: "queued" | "retrying" | "failed-permanent";
}

export interface RetryExecutor {
  (write: QueuedWrite): Promise<void>;
}

const DB_NAME = "tafakah-retry-queue";
const STORE = "writes";
const DB_VERSION = 1;
const MAX_ATTEMPTS = 12;

const BACKOFF_MS = [
  1_000, 5_000, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000,
  60 * 60_000, 60 * 60_000, 60 * 60_000, 60 * 60_000, 60 * 60_000, 60 * 60_000,
];

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueue(
  write: Omit<QueuedWrite, "id" | "attempts" | "nextRetryAt" | "createdAt" | "status">
): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const now = Date.now();
  const item: QueuedWrite = {
    ...write,
    id,
    attempts: 0,
    nextRetryAt: now + BACKOFF_MS[0],
    createdAt: now,
    status: "queued",
  };
  await db.put(STORE, item);
  try { window.dispatchEvent(new CustomEvent("retry-queue-changed")); } catch { /* ignore */ }
  return id;
}

export async function listPending(): Promise<QueuedWrite[]> {
  const db = await getDB();
  const rows = (await db.getAll(STORE)) as QueuedWrite[];
  return rows.sort((a, b) => a.nextRetryAt - b.nextRetryAt);
}

export async function remove(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
  try { window.dispatchEvent(new CustomEvent("retry-queue-changed")); } catch { /* ignore */ }
}

export async function clear(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
  try { window.dispatchEvent(new CustomEvent("retry-queue-changed")); } catch { /* ignore */ }
}

/** Retry every write whose `nextRetryAt <= now`. Caller supplies the executor that performs the actual Supabase call. */
export async function retryAll(executor: RetryExecutor): Promise<{ succeeded: number; failed: number; stillQueued: number }> {
  const db = await getDB();
  const items = (await db.getAll(STORE)) as QueuedWrite[];
  const now = Date.now();
  let succeeded = 0, failed = 0, stillQueued = 0;

  for (const item of items) {
    if (item.status === "failed-permanent") { stillQueued++; continue; }
    if (item.nextRetryAt > now) { stillQueued++; continue; }

    try {
      await executor(item);
      await db.delete(STORE, item.id);
      succeeded++;
    } catch (err) {
      const attempts = item.attempts + 1;
      const permanent = attempts >= MAX_ATTEMPTS;
      const next: QueuedWrite = {
        ...item,
        attempts,
        lastError: (err as Error).message,
        nextRetryAt: now + (BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 60 * 60_000),
        status: permanent ? "failed-permanent" : "retrying",
      };
      await db.put(STORE, next);
      if (permanent) failed++;
      else stillQueued++;
    }
  }

  try { window.dispatchEvent(new CustomEvent("retry-queue-changed")); } catch { /* ignore */ }
  return { succeeded, failed, stillQueued };
}

export const RETRY_CHANGE_EVENT = "retry-queue-changed";
