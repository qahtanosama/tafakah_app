"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listPending, retryAll, remove as removeFromQueue, clear as clearQueue,
  RETRY_CHANGE_EVENT, type QueuedWrite,
} from "@/lib/retry-queue";

interface Ctx {
  pending: QueuedWrite[];
  pendingCount: number;
  syncing: boolean;
  isOnline: boolean;
  /** User-initiated retry: bypasses backoff, also revives failed-permanent rows for one more attempt. */
  retry: () => Promise<void>;
  /** Retry a single write regardless of its state. */
  retryOne: (id: string) => Promise<void>;
  removeOne: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const RetryQueueContext = createContext<Ctx | null>(null);

export function useRetryQueue(): Ctx {
  const ctx = useContext(RetryQueueContext);
  if (!ctx) throw new Error("useRetryQueue must be used inside RetryQueueProvider");
  return ctx;
}

async function executeQueued(write: QueuedWrite): Promise<void> {
  const supabase = createClient();
  const payload = write.payload as Record<string, unknown>;
  const id = (payload?.id as string | undefined) ?? "";

  if (write.operation === "insert") {
    const { error } = await supabase.from(write.entity).insert(payload as never);
    if (error) throw error;
    return;
  }
  if (write.operation === "update") {
    if (!id) throw new Error("update missing id");
    const rest = { ...payload } as Record<string, unknown>;
    delete rest.id;
    const { error } = await supabase.from(write.entity).update(rest as never).eq("id", id);
    if (error) throw error;
    return;
  }
  if (write.operation === "delete") {
    if (!id) throw new Error("delete missing id");
    const { error } = await supabase.from(write.entity).delete().eq("id", id);
    if (error) throw error;
    return;
  }
  throw new Error(`Unknown operation ${write.operation}`);
}

export function RetryQueueProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<QueuedWrite[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listPending();
      setPending(rows);
    } catch {
      setPending([]);
    }
  }, []);

  // Background auto-retry: honors backoff timing and skips failed-permanent rows.
  const retryDue = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await retryAll(executeQueued);
      if (result.succeeded > 0) {
        try {
          const msg = `Synced ${result.succeeded} item${result.succeeded === 1 ? "" : "s"}`;
          window.dispatchEvent(new CustomEvent("retry-queue-toast", { detail: { type: "success", msg } }));
        } catch { /* ignore */ }
      }
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh, syncing]);

  // User-initiated retry: bypasses backoff, revives failed-permanent.
  const retry = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await retryAll(executeQueued, { force: true });
      const msg = result.succeeded > 0
        ? `Synced ${result.succeeded} item${result.succeeded === 1 ? "" : "s"}${result.stillQueued > 0 ? `, ${result.stillQueued} still queued` : ""}`
        : result.stillQueued > 0
          ? `Still failing (${result.stillQueued} item${result.stillQueued === 1 ? "" : "s"}). Check the error below.`
          : "Nothing to retry.";
      try { window.dispatchEvent(new CustomEvent("retry-queue-toast", { detail: { type: result.succeeded > 0 ? "success" : "info", msg } })); } catch { /* ignore */ }
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh, syncing]);

  const retryOne = useCallback(async (id: string) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await retryAll(executeQueued, { onlyId: id });
      const msg = result.succeeded > 0
        ? "Synced."
        : "Still failing \u2014 check the error.";
      try { window.dispatchEvent(new CustomEvent("retry-queue-toast", { detail: { type: result.succeeded > 0 ? "success" : "info", msg } })); } catch { /* ignore */ }
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh, syncing]);

  const removeOne = useCallback(async (id: string) => {
    await removeFromQueue(id);
    refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    await clearQueue();
    refresh();
  }, [refresh]);

  // Initial load + listen for changes
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(RETRY_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(RETRY_CHANGE_EVENT, onChange);
  }, [refresh]);

  // Online/offline
  useEffect(() => {
    function on() { setIsOnline(true); retry(); }
    function off() { setIsOnline(false); }
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [retry]);

  // Periodic retry while online
  useEffect(() => {
    if (!isOnline) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    tickRef.current = setInterval(() => {
      if (pending.some((p) => p.nextRetryAt <= Date.now() && p.status !== "failed-permanent")) {
        retry();
      }
    }, 30_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isOnline, pending, retry]);

  const value: Ctx = {
    pending,
    pendingCount: pending.length,
    syncing,
    isOnline,
    retry,
    removeOne,
    clearAll,
  };

  return <RetryQueueContext.Provider value={value}>{children}</RetryQueueContext.Provider>;
}
