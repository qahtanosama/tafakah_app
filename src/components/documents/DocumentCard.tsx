"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Loader2, CheckCircle, AlertTriangle, Info } from "lucide-react";
import type { TradeDocument, ValidationResult } from "@/types/document";
import { CATEGORY_LABELS } from "@/types/document";

interface Props {
  doc: TradeDocument;
  onRemove: (id: string) => void;
}

const STATUS_BADGES: Record<string, string> = {
  certificate_of_origin: "bg-blue-100 text-blue-800",
  bill_of_lading: "bg-purple-100 text-purple-800",
  phytosanitary_certificate: "bg-green-100 text-green-800",
  unknown: "bg-zinc-100 text-zinc-600",
};

function ValidationRow({ v }: { v: ValidationResult }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {v.status === "match" && <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />}
      {v.status === "mismatch" && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />}
      {v.status === "missing" && <Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />}
      <div>
        <span className="font-medium">{v.field}</span>
        {v.status === "mismatch" && (
          <span className="text-red-600">
            {" "}— expected &ldquo;{v.expected}&rdquo;, found &ldquo;{v.actual}&rdquo;
          </span>
        )}
        {v.status === "missing" && <span className="text-amber-600"> — not found in document</span>}
      </div>
    </div>
  );
}

export default function DocumentCard({ doc, onRemove }: Props) {
  const isProcessing = doc.status === "uploading" || doc.status === "analyzing";
  const statusLabel =
    doc.status === "uploading" ? "Uploading..." :
    doc.status === "analyzing" ? "Analyzing..." :
    doc.status === "error" ? doc.error ?? "Error" :
    "Ready";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm">{doc.fileName}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[doc.category]}`}>
              {CATEGORY_LABELS[doc.category]}
            </span>
            {doc.confidence > 0 && doc.status === "ready" && (
              <span className="text-xs text-zinc-400">{Math.round(doc.confidence * 100)}% confidence</span>
            )}
            {isProcessing && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                {statusLabel}
              </span>
            )}
            {doc.status === "error" && (
              <span className="text-xs text-red-500">{statusLabel}</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onRemove(doc.id)} title="Remove">
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </CardHeader>

      {doc.status === "ready" && (
        <CardContent className="space-y-3 pt-0">
          {/* Extracted fields */}
          {Object.keys(doc.extractedFields).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-zinc-500">Extracted Fields</p>
              <div className="grid gap-1 text-xs sm:grid-cols-2">
                {Object.entries(doc.extractedFields).map(([k, v]) =>
                  v ? (
                    <div key={k}>
                      <span className="text-zinc-400">{k}: </span>
                      <span>{v}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* Validation results */}
          {doc.validationResults.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-zinc-500">Validation</p>
              <div className="space-y-1">
                {doc.validationResults.map((v, i) => (
                  <ValidationRow key={i} v={v} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
