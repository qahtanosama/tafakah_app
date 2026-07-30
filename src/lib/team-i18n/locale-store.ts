"use client";

/**
 * Team-app language, held per browser.
 *
 * Why this is separate from next-intl: the portal gets its locale from a
 * `[locale]` path segment, and the team routes have none. Adding one would
 * change every team URL and the proxy that guards them — far too much blast
 * radius for a language toggle. So the team app carries its own tiny dictionary
 * and reads the choice from localStorage.
 *
 * Per person, not per company: a Chinese colleague sees 中文 while an
 * English-reading one is untouched.
 *
 * Read through useSyncExternalStore so the value is available on the first
 * client render, with a stable server snapshot to hydrate against — no mount
 * effect, no cascading render, no flash of the wrong language.
 */

export type TeamLocale = "en" | "zh";

const KEY = "team.locale";

/** Stable identity; hydration compares against this exact object. */
const SERVER_SNAPSHOT: { locale: TeamLocale } = { locale: "en" };

let snapshot: { locale: TeamLocale } | null = null;
const listeners = new Set<() => void>();

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocaleSnapshot(): { locale: TeamLocale } {
  snapshot ??= { locale: read() };
  return snapshot;
}

export function getServerLocaleSnapshot(): { locale: TeamLocale } {
  return SERVER_SNAPSHOT;
}

export function setTeamLocale(locale: TeamLocale): void {
  snapshot = { locale };
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    // Storage blocked — the choice still applies for this session.
  }
  for (const listener of listeners) listener();
  // <html lang> drives font fallback and screen-reader pronunciation.
  if (typeof document !== "undefined") document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
}

function read(): TeamLocale {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "zh" || stored === "en") return stored;
    // First visit: follow the browser, since a Chinese-configured machine is a
    // good signal and the toggle is one click away either way.
    if (typeof navigator !== "undefined" && /^zh\b/i.test(navigator.language || "")) return "zh";
  } catch {
    // ignore
  }
  return "en";
}
