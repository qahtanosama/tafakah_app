export type WorkflowStage =
  | "costed"
  | "docs-generated"
  | "sent-to-factory"
  | "sc-sent-to-buyer"
  | "shipped"
  | "certs-ready"
  | "delivered";

export const STAGE_ORDER: WorkflowStage[] = [
  "costed",
  "docs-generated",
  "sent-to-factory",
  "sc-sent-to-buyer",
  "shipped",
  "certs-ready",
  "delivered",
];

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  "costed": "Costed",
  "docs-generated": "Docs Generated",
  "sent-to-factory": "Sent to Factory",
  "sc-sent-to-buyer": "SC Sent to Buyer",
  "shipped": "Shipped",
  "certs-ready": "Certs Ready",
  "delivered": "Delivered",
};

export type StageCompletion = {
  completedAt: string;
  by: "auto" | "manual";
  triggeredBy?: "ATD" | "ATA" | string;
  docsSent?: ("sc" | "ci" | "ci-customs" | "pl" | "merged")[];
  sellerId?: string;
  notes?: string;
};

export type ContractCertRef = {
  docId: string;
  uploadedAt: string;
  fileName: string;
  fileSize: number;
};

export type ContractCerts = {
  co?: ContractCertRef;
  health?: ContractCertRef;
  phyto?: ContractCertRef;
};

export type RequiredCert = "co" | "health" | "phyto";

export type ContractWorkflow = {
  currentStage: WorkflowStage;
  history: Partial<Record<WorkflowStage, StageCompletion>>;
  certs?: ContractCerts;
};

export type StageStatus = "completed" | "current" | "pending" | "blocked";

/** Default workflow applied to old contracts that pre-date this feature. */
export function defaultWorkflow(createdAt: string): ContractWorkflow {
  return {
    currentStage: "docs-generated",
    history: {
      "docs-generated": { completedAt: createdAt, by: "auto" },
    },
  };
}

/* ──────────────────── Supabase workflow (Batch 3.7b) ──────────────────── */
//
// The `contracts.workflow_history` jsonb column holds BOTH the stage history map
// and the cert refs: `{ history, certs }`. `current_stage` is a separate column.
// All pure logic below operates on these — no localStorage, no I/O.

export type WorkflowHistory = {
  history: Partial<Record<WorkflowStage, StageCompletion>>;
  certs: ContractCerts;
};

export function emptyWorkflowHistory(): WorkflowHistory {
  return { history: {}, certs: {} };
}

/**
 * Normalize whatever sits in `workflow_history` jsonb into a WorkflowHistory.
 * Back-compat: rows written before this batch stored the bare history map, so
 * an object without a `history`/`certs` key is treated as the history map.
 */
export function normalizeWorkflowHistory(raw: unknown): WorkflowHistory {
  if (!raw || typeof raw !== "object") return emptyWorkflowHistory();
  const obj = raw as Record<string, unknown>;
  if ("history" in obj || "certs" in obj) {
    return {
      history: (obj.history as WorkflowHistory["history"]) ?? {},
      certs: (obj.certs as ContractCerts) ?? {},
    };
  }
  return { history: obj as WorkflowHistory["history"], certs: {} };
}

/** Stage status given the current stage + history map. Pure. */
export function getStageStatusFor(
  currentStage: WorkflowStage,
  history: WorkflowHistory["history"],
  stage: WorkflowStage
): StageStatus {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const stageIdx = STAGE_ORDER.indexOf(stage);
  if (history[stage]) return "completed";
  if (stageIdx === currentIdx) return "current";
  if (stageIdx < currentIdx) return "completed";
  const prev = STAGE_ORDER[stageIdx - 1];
  if (prev && !history[prev] && currentStage !== prev) return "blocked";
  return "pending";
}

export interface CanAdvanceResult {
  allowed: boolean;
  reason?: string;
}

/** One-step-forward guard. Pure. */
export function canAdvanceTo(currentStage: WorkflowStage, target: WorkflowStage): CanAdvanceResult {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const targetIdx = STAGE_ORDER.indexOf(target);
  if (targetIdx === -1) return { allowed: false, reason: "Unknown stage" };
  if (targetIdx <= currentIdx) {
    return { allowed: false, reason: "Cannot move backwards — use backfill for past stages." };
  }
  if (targetIdx !== currentIdx + 1) {
    return { allowed: false, reason: "Can only advance one stage at a time." };
  }
  return { allowed: true };
}

export const REQUIRED_CERTS: RequiredCert[] = ["co", "health", "phyto"];

/** Required certs not yet present. Pure. */
export function missingCerts(certs: ContractCerts | undefined): RequiredCert[] {
  return REQUIRED_CERTS.filter((c) => !certs?.[c]);
}
