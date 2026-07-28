"use client";

/**
 * Quote language as an external store, read through useSyncExternalStore.
 *
 * This is the only calculator preference still held per browser — cost sheets,
 * FX rates and margin now live per product in Supabase so the team shares them
 * (see lib/data/cost-sheets.ts). Language is genuinely personal: which script
 * one person prefers to paste is nobody else's business.
 *
 * localStorage cannot be read during server rendering, and loading it in a
 * mount effect meant a render with the default, a setState, and a second render.
 * An external store hands React a stable server snapshot to hydrate against and
 * the real value immediately after, with no effect and no cascading render.
 */

import { type QuoteLang, loadLang, saveLang } from "./storage";

/** Stable identity — hydration compares against this exact value's holder. */
const SERVER_SNAPSHOT: { lang: QuoteLang } = { lang: "en" };

let snapshot: { lang: QuoteLang } | null = null;
const listeners = new Set<() => void>();

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLangSnapshot(): { lang: QuoteLang } {
  snapshot ??= { lang: loadLang() };
  return snapshot;
}

export function getServerLangSnapshot(): { lang: QuoteLang } {
  return SERVER_SNAPSHOT;
}

/**
 * False only during hydration, while React is still rendering against the server
 * snapshot. The calculator shows a skeleton until this flips.
 */
export function langHydrated(current: { lang: QuoteLang }): boolean {
  return current !== SERVER_SNAPSHOT;
}

export function setStoredLang(lang: QuoteLang): void {
  snapshot = { lang };
  saveLang(lang);
  for (const listener of listeners) listener();
}
