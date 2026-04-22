"use client";

import { enqueue, type QueuedEntity, type QueuedOperation } from "@/lib/retry-queue";

/** A 4xx response is a validation/auth problem — not a retryable network error. */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { message?: string; code?: string; status?: number; name?: string };

  if (anyErr.name === "TypeError" && /fetch/i.test(anyErr.message ?? "")) return true;
  if (/network|timeout|connection|failed to fetch|offline/i.test(anyErr.message ?? "")) return true;
  if (anyErr.code === "PGRST002") return true; // gateway timeout from PostgREST

  if (typeof anyErr.status === "number") {
    if (anyErr.status >= 500 || anyErr.status === 408 || anyErr.status === 0) return true;
    // 4xx: validation/auth. Don't retry.
    return false;
  }
  // Supabase JS errors without status but with a "FetchError" marker
  if (anyErr.name === "FetchError" || anyErr.name === "AbortError") return true;
  return false;
}

/**
 * Run `fn`. On network errors, queue the write and return "queued". On non-network errors, throw.
 * On success, return the value.
 */
export async function withRetryQueue<T>(
  fn: () => Promise<T>,
  queuedWrite: {
    entity: QueuedEntity;
    operation: QueuedOperation;
    payload: unknown;
    idempotencyKey: string;
    originPath?: string;
  }
): Promise<T | "queued"> {
  try {
    return await fn();
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueue(queuedWrite);
      return "queued";
    }
    throw err;
  }
}
