"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Check, Lock, Factory, MessageCircle, Upload, Wallet, Send, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContractLogEntry } from "@/types/sales-contract";
import { STAGE_ORDER, STAGE_LABELS, type WorkflowStage } from "@/types/workflow";
import {
  getWorkflow,
  getStageStatus,
  advanceStage,
  skipStageTo,
  backfillStage,
  missingCertsForStage6,
  findContractById,
} from "@/lib/workflow";
import QuickShareDialog, { type QuickShareRecipientType } from "@/components/quick-share/QuickShareDialog";
import type { QuickShareDoc } from "@/lib/quick-share/download";

interface Props {
  contract: ContractLogEntry;
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

export default function StageStrip({ contract: initialContract, compact = false }: Props) {
  // Local refresh — re-read the contract from storage when workflow updates elsewhere
  const [version, setVersion] = useState(0);
  const contract = useMemo(() => {
    // Re-read to pick up any mutation; fall back to prop if not found in log
    return findContractById(initialContract.id) ?? initialContract;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContract, version]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "contract-log" || e.key === "active-contract") refresh();
    };
    window.addEventListener("workflow-updated", refresh as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("workflow-updated", refresh as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const [quickShare, setQuickShare] = useState<{
    open: boolean;
    recipientType: QuickShareRecipientType;
    initialDocs?: QuickShareDoc[];
    onSent?: (docs: QuickShareDoc[]) => void;
  } | null>(null);
  const [stage6Modal, setStage6Modal] = useState(false);

  const wf = getWorkflow(contract);
  const currentStage = wf.currentStage;

  // Keep prop-reads consistent — derive state per pill
  return (
    <div className="w-full">
      <div className={`flex ${compact ? "gap-1" : "gap-2"} overflow-x-auto pb-2`}>
        {STAGE_ORDER.map((stage) => {
          const status = getStageStatus(contract, stage);
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
            <div key={stage} className={`${base} ${cls}`} title={titleParts.join(" \u2014 ")}>
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
          contract={contract}
          onOpenQuickShare={(cfg) => setQuickShare({ open: true, ...cfg })}
          onOpenStage6={() => setStage6Modal(true)}
        />
      )}

      {quickShare && (
        <QuickShareDialog
          open={quickShare.open}
          onClose={() => setQuickShare(null)}
          contract={contract}
          recipientType={quickShare.recipientType}
          initialDocs={quickShare.initialDocs}
          onSent={quickShare.onSent}
        />
      )}

      {stage6Modal && (
        <Stage6Modal
          onClose={() => setStage6Modal(false)}
          onMarkSent={() => {
            advanceStage(contract.id, "delivered", { by: "manual", notes: "marked sent outside app" });
            setStage6Modal(false);
          }}
          contractNo={contract.contractNo}
        />
      )}

      {currentStage === "costed" && null /* handled inside StageActions */}
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*                     Action panel per stage              */
/* ──────────────────────────────────────────────────────── */
function StageActions({
  contract,
  onOpenQuickShare,
  onOpenStage6,
}: {
  contract: ContractLogEntry;
  onOpenQuickShare: (cfg: { recipientType: QuickShareRecipientType; initialDocs?: QuickShareDoc[]; onSent?: (docs: QuickShareDoc[]) => void }) => void;
  onOpenStage6: () => void;
}) {
  const wf = getWorkflow(contract);
  const current = wf.currentStage;
  const costedHistory = wf.history["costed"];
  const stageSent = wf.history["sent-to-factory"];
  const stageSC = wf.history["sc-sent-to-buyer"];
  const stageShipped = wf.history["shipped"];
  const stageDelivered = wf.history["delivered"];

  const missing = missingCertsForStage6(contract);
  const sellerId = contract.masterSnapshot.sellerId ?? contract.sellerId;

  const handleBackfillCosted = useCallback(() => {
    backfillStage(contract.id, "costed", { by: "manual" });
  }, [contract.id]);

  const handleSkipToBuyer = useCallback(() => {
    skipStageTo(contract.id, "sc-sent-to-buyer", { skipNotes: "skipped" });
  }, [contract.id]);

  const handleMarkSentToFactory = useCallback(() => {
    onOpenQuickShare({
      recipientType: "factory",
      onSent: (docs) => {
        advanceStage(contract.id, "sent-to-factory", { by: "manual", docsSent: docs, sellerId });
      },
    });
  }, [contract.id, onOpenQuickShare, sellerId]);

  const handleMarkSCToBuyer = useCallback(() => {
    onOpenQuickShare({
      recipientType: "buyer",
      initialDocs: ["sc"],
      onSent: (docs) => {
        advanceStage(contract.id, "sc-sent-to-buyer", { by: "manual", docsSent: docs });
      },
    });
  }, [contract.id, onOpenQuickShare]);

  // === COSTED ===
  if (current === "costed") {
    return (
      <div className="mt-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
        <p className="mb-2 font-medium">Stage: Costed</p>
        <p className="mb-3 text-xs text-zinc-500">Finalize costs to move on. Docs can be generated from Master Data afterwards.</p>
        <Button size="sm" onClick={() => advanceStage(contract.id, "docs-generated", { by: "manual" })}>
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
        <Link href={`/shipping/${encodeURIComponent(contract.contractNo)}`} className="inline-block">
          <Button size="sm" variant="outline" className="gap-1">Go to Shipping Tracker</Button>
        </Link>
      </div>
    );
  }

  // === SHIPPED ===
  if (current === "shipped") {
    const coChecked = !!wf.certs?.co;
    const healthChecked = !!wf.certs?.health;
    const phytoChecked = !!wf.certs?.phyto;
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
          Goods in transit{shippedAt ? ` \u2014 auto-advanced from ATD on ${shippedAt}` : ""}.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md border bg-zinc-50 px-2 py-1 text-xs dark:bg-zinc-800">
            CO {coChecked ? "\u2713" : "\u25cb"} &middot; Health {healthChecked ? "\u2713" : "\u25cb"} &middot; Phyto {phytoChecked ? "\u2713" : "\u25cb"}{" "}
            <span className="text-zinc-400">({uploadedCount}/3 uploaded)</span>
          </span>
          <Link href={`/documents?contract=${encodeURIComponent(contract.contractNo)}`}>
            <Button size="sm" variant="outline" className="gap-1"><Upload className="h-3.5 w-3.5" /> Upload Certs</Button>
          </Link>
          {allReady && (
            <Button
              size="sm"
              onClick={() => advanceStage(contract.id, "certs-ready", { by: "manual", notes: "all 3 certs uploaded" })}
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
          <Link href={`/documents?contract=${encodeURIComponent(contract.contractNo)}`}>
            <Button size="sm" variant="outline" className="gap-1"><Upload className="h-3.5 w-3.5" /> Open Trade Documents</Button>
          </Link>
          <Button size="sm" onClick={onOpenStage6} disabled={blocked} className="gap-1">
            <Send className="h-3.5 w-3.5" /> Finalize &amp; Send to Buyer
          </Button>
        </div>
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
          Delivered on {stageDelivered ? fmtDate(stageDelivered.completedAt) : "\u2014"}.
        </p>
        <div className="mt-3 text-xs text-zinc-400">
          History: Sent to factory {stageSent ? fmtDate(stageSent.completedAt) : "\u2014"} &middot;
          {" "}SC sent {stageSC ? fmtDate(stageSC.completedAt) : "\u2014"} &middot;
          {" "}Shipped {stageShipped ? fmtDate(stageShipped.completedAt) : "\u2014"}
        </div>
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
