"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/team-i18n";

const DISMISS_MS = 5000;

/**
 * Confirmation for actions whose result happens off this screen — sending a
 * quote to Master Data, or a clipboard write that failed. Dismissible, because
 * "open Master Data to finish" is an instruction someone may need a moment to
 * read.
 */
export default function Toast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  const t = useT("calc");

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  return (
    // Always mounted so the live region is present before the text arrives —
    // a region added at the same time as its content is often not announced.
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 top-20 z-50 flex justify-end">
      {message && (
        <div className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl bg-card px-4 py-3 text-sm shadow-lg ring-1 ring-foreground/10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
          <p className="font-medium">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("dismiss")}
            className="-mr-1 rounded-md p-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
