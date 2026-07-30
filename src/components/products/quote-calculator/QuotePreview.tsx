"use client";

import { useEffect, useRef } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuoteLang } from "@/lib/quote/storage";
import { useT } from "@/lib/team-i18n";

interface Props {
  open: boolean;
  lang: QuoteLang;
  text: string;
  onTextChange: (text: string) => void;
  onCopy: () => void;
  onClose: () => void;
  copied: boolean;
}

/**
 * Read the quote before it goes out, and edit the wording if the deal needs it.
 *
 * Native <dialog> rather than a hand-rolled overlay: it gives focus trapping,
 * Escape to close, inert background content and the top-layer stacking for
 * free. The previous fixed-position div had none of those.
 */
export default function QuotePreview({
  open,
  lang,
  text,
  onTextChange,
  onCopy,
  onClose,
  copied,
}: Props) {
  const t = useT("calc");
  const tc = useT("common");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Escape and backdrop-dismiss both route through onClose so React state
      // stays in step with the element's own open/closed state.
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="quote-preview-heading"
      className="m-auto w-[calc(100vw-2rem)] max-w-lg rounded-xl bg-card p-0 text-card-foreground shadow-xl ring-1 ring-foreground/10 backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-5 py-3.5">
        <h2 id="quote-preview-heading" className="font-heading text-base font-semibold">
          {t("previewTitle")}
          <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400" dir="auto">
            {lang === "ar" ? t("langAr") : t("langEn")}
          </span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("closePreview")}
          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="px-5 py-4">
        <label htmlFor="quote-text" className="sr-only">
          {t("previewTextLabel")}
        </label>
        <textarea
          id="quote-text"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          dir={lang === "ar" ? "rtl" : "ltr"}
          rows={16}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white p-4 font-mono text-sm leading-relaxed text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-300"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-foreground/10 px-5 py-3.5">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {tc("close")}
        </Button>
        <Button size="sm" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t("copied") : t("copyQuote")}
        </Button>
      </div>
    </dialog>
  );
}
