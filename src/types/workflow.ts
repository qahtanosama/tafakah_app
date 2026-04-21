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
