"use client";

import { useState } from "react";
import { Layers, Loader2, X, Download } from "lucide-react";

export interface MergeDialogLabels {
  trigger: string;
  title: string;
  description: string;
  generatedHeading: string;
  uploadedHeading: string;
  sc: string;
  ci: string;
  customs: string;
  pl: string;
  freight: string;
  download: string;
  cancel: string;
  selectAtLeastOne: string;
}

/** An uploaded certificate the client may include in the merge (PDFs only). */
export interface MergeCertDoc {
  id: string;
  label: string;
}

interface Props {
  contractId: string;
  /** Freight is FOB-only — the checkbox only appears when true. */
  isFob: boolean;
  /** Uploaded certificates available for this contract (CO/Health/Phyto/B-L/Other). */
  certDocs: MergeCertDoc[];
  labels: MergeDialogLabels;
}

type DocType = "sc" | "ci" | "customs" | "pl" | "freight";

// Fixed display + merge order for generated docs. The server enforces the same.
const ORDER: DocType[] = ["sc", "ci", "customs", "pl", "freight"];

export default function MergeDocumentsDialog({ contractId, isFob, certDocs, labels }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default selection: SC + CI + PL checked; Customs + Freight unchecked.
  const [checked, setChecked] = useState<Record<DocType, boolean>>({
    sc: true,
    ci: true,
    customs: false,
    pl: true,
    freight: false,
  });
  // Uploaded certificates are pre-checked by default — the client gets the full
  // package and can uncheck any they don't want.
  const [certChecked, setCertChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(certDocs.map((c) => [c.id, true])),
  );

  const options: { id: DocType; label: string }[] = [
    { id: "sc", label: labels.sc },
    { id: "ci", label: labels.ci },
    { id: "customs", label: labels.customs },
    { id: "pl", label: labels.pl },
    ...(isFob ? [{ id: "freight" as DocType, label: labels.freight }] : []),
  ];

  const selectedCount =
    options.filter((o) => checked[o.id]).length +
    certDocs.filter((c) => certChecked[c.id]).length;

  const toggle = (id: DocType) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
    setError(null);
  };
  const toggleCert = (id: string) => {
    setCertChecked((prev) => ({ ...prev, [id]: !prev[id] }));
    setError(null);
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
  };

  const onDownload = async () => {
    // Generated docs in canonical order (server re-orders too); selected certs.
    const selected = ORDER.filter((id) => checked[id] && options.some((o) => o.id === id));
    const selectedCerts = certDocs.filter((c) => certChecked[c.id]).map((c) => c.id);
    if (selected.length === 0 && selectedCerts.length === 0) {
      setError(labels.selectAtLeastOne);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ contractId });
      if (selected.length) params.set("docTypes", selected.join(","));
      if (selectedCerts.length) params.set("certIds", selectedCerts.join(","));
      const resp = await fetch(`/api/portal/merge-pdf?${params.toString()}`, {
        credentials: "include",
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        setError(text || `Merge failed (${resp.status})`);
        return;
      }
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/i.exec(disposition);
      const filename = match?.[1] ?? `${contractId}-package.pdf`;
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message || "Merge failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-navy bg-navy px-3 text-sm font-medium text-white transition-colors hover:bg-navy/90"
      >
        <Layers className="h-3.5 w-3.5" />
        {labels.trigger}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-navy">{labels.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{labels.description}</p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                aria-label={labels.cancel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Generated documents */}
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.generatedHeading}
            </p>
            <div className="mt-1 space-y-1">
              {options.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={checked[o.id]}
                    onChange={() => toggle(o.id)}
                    disabled={busy}
                    className="h-4 w-4 accent-navy"
                  />
                  <span className="font-medium text-foreground">{o.label}</span>
                </label>
              ))}
            </div>

            {/* Uploaded certificates (only if any mergeable PDFs exist) */}
            {certDocs.length > 0 && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.uploadedHeading}
                </p>
                <div className="mt-1 space-y-1">
                  {certDocs.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={!!certChecked[c.id]}
                        onChange={() => toggleCert(c.id)}
                        disabled={busy}
                        className="h-4 w-4 accent-navy"
                      />
                      <span className="min-w-0 truncate font-medium text-foreground">{c.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="inline-flex h-9 items-center rounded-md border bg-white px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={busy || selectedCount === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-navy bg-navy px-4 text-sm font-medium text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {labels.download}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
