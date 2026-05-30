"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Lock, Factory, MessageCircle, Upload, Wallet, Send, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContractLogEntry } from "@/types/sales-contract";
import {
  STAGE_ORDER, STAGE_LABELS, type WorkflowStage,
  type WorkflowHistory, type ContractCerts,
  normalizeWorkflowHistory, getStageStatusFor, missingCerts,
} from "@/types/workflow";
import {
  useContract, useAdvanceStage, useSkipStage, useBackfillStage,
  type ContractRow,
} from "@/lib/data/contracts";
import QuickShareDialog, { type QuickShareRecipientType } from "@/components/quick-share/QuickShareDialog";
import type { QuickShareDoc } from "@/lib/quick-share/download";
import FinalPackagePanel from "@/components/workflow/FinalPackagePanel";
import { generateMergedPdfForContract } from "@/lib/contracts/generate-merged-pdf";

interface Props {
  contractId: string;
  compact?: boolean;
}

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STAGE_ICON: Record<WorkflowStage, React.ComponentType<{ className?: string }>> = {
  "costed": Wallet,
  "docs-generated": Send,
  "sent-to-factory": Factory,
  "sc-sent-to-buyer": MessageCircle,
  "shipped": Send,
  "certs-ready": Upload,
  "delivered": Archive,
};

/** Adapt a Supabase ContractRow into the ContractLogEntry shape QuickShareDialog expects. */
function toLegacyContract(row: ContractRow, wf: WorkflowHistory): ContractLogEntry | null {
  if (!row.master_snapshot) return null;
  return {
    id: row.id,
    contractNo: row.contract_no,
    invoiceNo: row.invoice_no,
    dateSubmitted: row.created_at,
    buyer: row.master_snapshot.buyer?.company ?? "",
    product: row.product_label ?? "",
    status: row.status,
    masterSnapshot: row.master_snapshot,
    sellerId: row.master_snapshot.sellerId,
    workflow: { currentStage: row.current_stage, history: wf.history, certs: wf.certs },
  };
}

export default function StageStrip({ contractId, compact = false }: Props) {
  const { data: contract } = useContract(contractId);
  const advance = useAdvanceStage();
  const skip = useSkipStage();
  const backfill = useBackfillStage();

  const [quickShare, setQuickShare] = useState<{
    open: boolean;
    recipientType: QuickShareRecipientType;
    initialDocs?: QuickShareDoc[];
    onSent?: (docs: QuickShareDoc[]) => void;
  } | null>(null);
  const [stage6Modal, setStage6Modal] = useState(false);

  const wf = useMemo(() => normalizeWorkflowHistory(contract?.workflow_history), [contract?.workflow_history]);

  if (!contract) return null;
  const currentStage = contract.current_stage;
  const legacyContract = toLegacyContract(contract, wf);

  return (
    <div className="w-full">
      <div className={`flex ${compact ? "gap-1" : "gap-2"} overflow-x-auto pb-2`}>
        {STAGE_ORDER.map((stage) => {
          const status = getStageStatusFor(currentStage, wf.history, stage);
          const completion = wf.history[stage];
          const Icon = STAGE_ICON[stage];
          const base = `flex shrink-0 items-center gap-1.5 rounded-full border ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} font-medium transition-colors`;

          const cls =
            status === "completed"
              ? "bg-[#1B2A4A] text-white border-[#1B2A4A]"
              : status === "current"
              ? "border-2 border-[#C5A572] bg-white text-[#1B2A4A] ring-2 ring-[#C5A572]/30"
              : status === "blocked"
              ? "border-zinc-200 bg-zinc-50 text-zinc-400"
              : "border-zinc-200 bg-white text-zinc-500";

          const titleParts: string[] = [STAGE_LABELS[stage]];
          if (completion) {
            const when = fmtDate(completion.completedAt);
            titleParts.push(`Completed ${when} (${completion.by})`);
            if (completion.docsSent && completion.docsSent.length) {
              titleParts.push(`Docs: ${completion.docsSent.join(", ")}`);
            }
            if (completion.notes) titleParts.push(`Notes: ${completion.notes}`);
          }

          return (
            <div key={stage} className={`${base} ${cls}`} title={titleParts.join(" — ")}>
              {status === "completed" ? <Check className="h-3.5 w-3.5" /> :
               status === "blocked" ? <Lock className="h-3 w-3" /> :
               <Icon className="h-3.5 w-3.5" />}
              <span>{STAGE_LABELS[stage]}</span>
            </div>
          );
        })}
      </div>

      {!compact && (
        <StageActions
          row={contract}
          currentStage={currentStage}
          history={wf.history}
          certs={wf.certs}
          advance={advance}
          skip={skip}
          backfill={backfill}
          onOpenQuickShare={(cfg) => setQuickShare({ open: true, ...cfg })}
          onOpenStage6={() => setStage6Modal(true)}
        />
      )}

      {quickShare && legacyContract && (
        <QuickShareDialog
          open={quickShare.open}
          onClose={() => setQuickShare(null)}
          contract={legacyContract}
          recipientType={quickShare.recipientType}
          initialDocs={quickShare.initialDocs}
          onSent={quickShare.onSent}
        />
      )}

      {stage6Modal && (
        <Stage6Modal
          onClose={() => setStage6Modal(false)}
          onMarkSent={() => {
            advance.mutate({ contractId, newStage: "delivered", completion: { by: "manual", notes: "marked sent outside app" } });
            setStage6Modal(false);
          }}
          contractNo={contract.contract_no}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*                     Action panel per stage              */
/* ──────────────────────────────────────────────────────── */
type Mutation<T> = { mutate: (vars: T) => void };

function StageActions({
  row,
  currentStage,
  history,
  certs,
  advance,
  skip,
  backfill,
  onOpenQuickShare,
  onOpenStage6,
}: {
  row: ContractRow;
  currentStage: WorkflowStage;
  history: WorkflowHistory["history"];
  certs: ContractCerts;
  advance: Mutation<{ contractId: string; newStage: WorkflowStage; completion?: { by: "auto" | "manual"; docsSent?: QuickShareDoc[]; sellerId?: string; notes?: string } }>;
  skip: Mutation<{ contractId: string; targetStage: WorkflowStage; skipNotes?: string }>;
  backfill: Mutation<{ contractId: string; stage: WorkflowStage; completion?: { by: "auto" | "manual" } }>;
  onOpenQuickShare: (cfg: { recipientType: QuickShareRecipientType; initialDocs?: QuickShareDoc[]; onSent?: (docs: QuickShareDoc[]) => void }) => void;
  onOpenStage6: () => void;
}) {
  const contractId = row.id;
  const contractNo = row.contract_no;
  const current = currentStage;
  const costedHistory = history["costed"];
  const stageSent = history["sent-to-factory"];
  const stageSC = history["sc-sent-to-buyer"];
  const stageShipped = history["shipped"];
  const stageDelivered = history["delivered"];

  const missing = missingCerts(certs);
  const sellerId = row.master_snapshot?.sellerId;

  const handleBackfillCosted = useCallback(() => {
    backfill.mutate({ contractId, stage: "costed", completion: { by: "manual" } });
  }, [backfill, contractId]);

  const handleSkipToBuyer = useCallback(() => {
    skip.mutate({ contractId, targetStage: "sc-sent-to-buyer", skipNotes: "skipped" });
  }, [skip, contractId]);

  const handleMarkSentToFactory = useCallback(() => {
    onOpenQuickShare({
      recipientType: "factory",
      onSent: (docs) => {
        advance.mutate({ contractId, newStage: "sent-to-factory", completion: { by: "manual", docsSent: docs, sellerId } });
      },
    });
  }, [advance, contractId, onOpenQuickShare, sellerId]);

  const handleMarkSCToBuyer = useCallback(() => {
    onOpenQuickShare({
      recipientType: "buyer",
      initialDocs: ["sc"],
      onSent: (docs) => {
        advance.mutate({ contractId, newStage: "sc-sent-to-buyer", completion: { by: "manual", docsSent: docs } });
      },
    });
  }, [advance, contractId, onOpenQuickShare]);

  // === COSTED ===
  if (current === "costed") {
    return (
      <div className="mt-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
        <p className="mb-2 font-medium">Stage: Costed</p>
        <p className="mb-3 text-xs text-zinc-500">Finalize costs to move on. Docs can be generated from Master Data afterwards.</p>
        <Button size="sm" onClick={() => advance.mutate({ contractId, newStage: "docs-generated", completion: { by: "manual" } })}>
          <Check className="mr-1 h-3.5 w-3.5" /> Mark Costs Complete
        </Button>
      </div>
    );
  }

  // Backfill UI for the costed stage (always visible when we're past it)
  const costedBackfill =
    costedHistory ? (
      <label className="flex items-center gap-2 text-xs text-zinc-500">
        <input type="checkbox" checked readOnly className="h-3.5 w-3.5 accent-emerald-600" />
        <span>Costs finalized on {fmtDate(costedHistory.completedAt)} ({costedHistory.by})</span>
      </label>
    ) : (
      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-500">
        <input type="checkbox" onChange={handleBackfillCosted} className="h-3.5 w-3.5 accent-emerald-600" />
        <span>Mark costs as finalized (backfill)</span>
      </label>
    );

  // === DOCS-GENERATED ===
  if (current === "docs-generated") {
    return (
      <div className="mt-3 space-y-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <p className="font-medium">Stage: Docs Generated</p>
          {costedBackfill}
        </div>
        <p className="text-xs text-zinc-500">Send to the factory first, or skip straight to the buyer if the factory doesn&rsquo;t need docs.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleMarkSentToFactory} className="gap-1">
            <Factory className="h-3.5 w-3.5" /> Send to Factory
          </Button>
          <Button size="sm" variant="outline" onClick={handleSkipToBuyer} className="gap-1">
            <MessageCircle className="h-3.5 w-3.5" /> Send SC to Buyer (skip factory)
          </Button>
        </div>
      </div>
    );
  }

  // === SENT-TO-FACTORY ===
  if (current === "sent-to-factory") {
    return (
      <div className="mt-3 space-y-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <p className="font-medium">Stage: Sent to Factory</p>
          {costedBackfill}
        </div>
        <p className="text-xs text-zinc-500">Factory notified. Next: send the SC to the buyer.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleMarkSCToBuyer} className="gap-1">
            <MessageCircle className="h-3.5 w-3.5" /> Send SC to Buyer
          </Button>
        </div>
      </div>
    );
  }

  // === SC-SENT-TO-BUYER ===
  if (current === "sc-sent-to-buyer") {
    return (
      <div className="mt-3 space-y-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <p className="font-medium">Stage: SC Sent to Buyer</p>
          {costedBackfill}
        </div>
        <p className="text-xs text-zinc-500">
          Waiting for shipment. The stage will auto-advance to <span className="font-medium">Shipped</span> when you set ATD on the Shipping Tracker.
        </p>
        <Link href={`/shipping/${encodeURIComponent(contractNo)}`} className="inline-block">
          <Button size="sm" variant="outline" className="gap-1">Go to Shipping Tracker</Button>
        </Link>
      </div>
    );
  }

  // === SHIPPED ===
  if (current === "shipped") {
    const coChecked = !!certs?.co;
    const healthChecked = !!certs?.health;
    const phytoChecked = !!certs?.phyto;
    const uploadedCount = [coChecked, healthChecked, phytoChecked].filter(Boolean).length;
    const allReady = uploadedCount === 3;
    const shippedAt = stageShipped ? fmtDate(stageShipped.completedAt) : "";
    return (
      <div className="mt-3 space-y-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <p className="font-medium">Stage: Shipped</p>
          {costedBackfill}
        </div>
        <p className="text-xs text-zinc-500">
          Goods in transit{shippedAt ? ` — auto-advanced from ATD on ${shippedAt}` : ""}.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md border bg-zinc-50 px-2 py-1 text-xs dark:bg-zinc-800">
            CO {coChecked ? "✓" : "○"} &middot; Health {healthChecked ? "✓" : "○"} &middot; Phyto {phytoChecked ? "✓" : "○"}{" "}
            <span className="text-zinc-400">({uploadedCount}/3 uploaded)</span>
          </span>
          <Link href={`/documents?contract=${encodeURIComponent(contractNo)}`}>
            <Button size="sm" variant="outline" className="gap-1"><Upload className="h-3.5 w-3.5" /> Upload Certs</Button>
          </Link>
          {allReady && (
            <Button
              size="sm"
              onClick={() => {
                advance.mutate(
                  { contractId, newStage: "certs-ready", completion: { by: "manual", notes: "all 3 certs uploaded" } },
                );
                // Fire the merge in the background; failures aren't fatal — the
                // user can retry from the Final Package panel below.
                generateMergedPdfForContract({ contractNo }).catch((err) => {
                  console.error("[stage-advance] merged PDF generation failed:", err);
                });
              }}
              className="gap-1"
            >
              <Check className="h-3.5 w-3.5" /> Advance to Certs Ready
            </Button>
          )}
        </div>
      </div>
    );
  }

  // === CERTS-READY ===
  if (current === "certs-ready") {
    const blocked = missing.length > 0;
    const missingNames = missing.map((c) => (c === "co" ? "Certificate of Origin" : c === "health" ? "Health Certificate" : "Phytosanitary")).join(", ");
    return (
      <div className="mt-3 space-y-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <p className="font-medium">Stage: Certs Ready</p>
          {costedBackfill}
        </div>
        {blocked ? (
          <p className="text-xs text-red-600">Upload all 3 certificates to advance. Missing: {missingNames}</p>
        ) : (
          <p className="text-xs text-zinc-500">All certificates uploaded. Finalize and send the merged package to the buyer.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={`/documents?contract=${encodeURIComponent(contractNo)}`}>
            <Button size="sm" variant="outline" className="gap-1"><Upload className="h-3.5 w-3.5" /> Open Trade Documents</Button>
          </Link>
          <Button size="sm" onClick={onOpenStage6} disabled={blocked} className="gap-1">
            <Send className="h-3.5 w-3.5" /> Finalize &amp; Send to Buyer
          </Button>
        </div>
        <FinalPackagePanel contractNo={contractNo} />
      </div>
    );
  }

  // === DELIVERED ===
  if (current === "delivered") {
    return (
      <div className="mt-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <p className="font-medium">Stage: Delivered</p>
          {costedBackfill}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Delivered on {stageDelivered ? fmtDate(stageDelivered.completedAt) : "—"}.
        </p>
        <div className="mt-3 text-xs text-zinc-400">
          History: Sent to factory {stageSent ? fmtDate(stageSent.completedAt) : "—"} &middot;
          {" "}SC sent {stageSC ? fmtDate(stageSC.completedAt) : "—"} &middot;
          {" "}Shipped {stageShipped ? fmtDate(stageShipped.completedAt) : "—"}
        </div>
        <FinalPackagePanel contractNo={contractNo} />
      </div>
    );
  }

  return null;
}

/* ──────────────────────────────────────────────────────── */
/*                  Stage 6 stub modal                     */
/* ──────────────────────────────────────────────────────── */
function Stage6Modal({ contractNo, onClose, onMarkSent }: {
  contractNo: string;
  onClose: () => void;
  onMarkSent: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-bold">Send Final Merged Package</h3>
        <p className="mb-4 text-sm text-zinc-500">
          The shareable-link flow needs deployment. For now, you can manually merge &amp; send, or mark as sent if you&rsquo;ve already sent it outside the app.
        </p>
        <div className="space-y-2">
          <Link href={`/documents?contract=${encodeURIComponent(contractNo)}`} onClick={onClose}>
            <Button variant="outline" className="w-full gap-1">
              <Upload className="h-4 w-4" /> Manual Merge &amp; Quick Share
            </Button>
          </Link>
          <Button onClick={onMarkSent} className="w-full gap-1">
            <Check className="h-4 w-4" /> Mark as Sent Anyway
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full">Cancel</Button>
        </div>
      </div>
    </div>
  );
}
