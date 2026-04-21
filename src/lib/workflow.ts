import type { ContractLogEntry } from "@/types/sales-contract";
import type {
  ContractWorkflow,
  ContractCertRef,
  RequiredCert,
  StageCompletion,
  StageStatus,
  WorkflowStage,
} from "@/types/workflow";
import { STAGE_ORDER, defaultWorkflow } from "@/types/workflow";
import { getContractLog, saveContractLog } from "./contract-log";
import { loadActiveContract, saveActiveContract } from "./master-data";
import { getFinance } from "./finance";

/** Non-mutating read: returns the workflow or a safe default for old contracts. */
export function getWorkflow(contract: ContractLogEntry): ContractWorkflow {
  return (
    contract.workflow
    ?? contract.masterSnapshot.workflow
    ?? defaultWorkflow(contract.dateSubmitted)
  );
}

export function getCurrentStage(contract: ContractLogEntry): WorkflowStage {
  return getWorkflow(contract).currentStage;
}

export function getStageStatus(
  contract: ContractLogEntry,
  stage: WorkflowStage
): StageStatus {
  const wf = getWorkflow(contract);
  const currentIdx = STAGE_ORDER.indexOf(wf.currentStage);
  const stageIdx = STAGE_ORDER.indexOf(stage);
  if (wf.history[stage]) return "completed";
  if (stageIdx === currentIdx) return "current";
  if (stageIdx < currentIdx) return "completed";
  // Stage is in the future. Block if the immediately preceding stage isn't done.
  const prev = STAGE_ORDER[stageIdx - 1];
  if (prev && !wf.history[prev] && wf.currentStage !== prev) return "blocked";
  return "pending";
}

export interface CanAdvanceResult {
  allowed: boolean;
  reason?: string;
}

export function canAdvanceTo(
  contract: ContractLogEntry,
  target: WorkflowStage
): CanAdvanceResult {
  const wf = getWorkflow(contract);
  const currentIdx = STAGE_ORDER.indexOf(wf.currentStage);
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

/** Internal: apply an arbitrary workflow mutation and persist to log + active (if current). */
function persistWorkflow(contractId: string, next: ContractWorkflow): ContractLogEntry | null {
  const log = getContractLog();
  const idx = log.findIndex((e) => e.id === contractId);
  if (idx < 0) return null;
  const prev = log[idx];
  const updated: ContractLogEntry = {
    ...prev,
    workflow: next,
    masterSnapshot: { ...prev.masterSnapshot, workflow: next },
  };
  log[idx] = updated;
  saveContractLog(log);

  const active = loadActiveContract();
  if (active && active.contractNo === prev.contractNo) {
    saveActiveContract({
      ...active,
      data: { ...active.data, workflow: next },
    });
  }

  // Notify other tabs + same-tab subscribers so UI can refresh
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("workflow-updated", { detail: { contractId, contractNo: prev.contractNo } }));
    }
  } catch {
    // ignore
  }

  return updated;
}

export function advanceStage(
  contractId: string,
  target: WorkflowStage,
  completion: Omit<StageCompletion, "completedAt">
): ContractLogEntry {
  const log = getContractLog();
  const contract = log.find((e) => e.id === contractId);
  if (!contract) throw new Error(`Contract ${contractId} not found`);

  const check = canAdvanceTo(contract, target);
  if (!check.allowed) throw new Error(check.reason ?? "Cannot advance stage");

  const wf = getWorkflow(contract);
  const entry: StageCompletion = { ...completion, completedAt: new Date().toISOString() };
  const next: ContractWorkflow = {
    ...wf,
    currentStage: target,
    history: { ...wf.history, [target]: entry },
  };
  const updated = persistWorkflow(contractId, next);
  if (!updated) throw new Error(`Contract ${contractId} disappeared during update`);
  return updated;
}

/** Backfill history for a completed stage without changing currentStage. */
export function backfillStage(
  contractId: string,
  stage: WorkflowStage,
  completion: Omit<StageCompletion, "completedAt"> & { completedAt?: string }
): ContractLogEntry | null {
  const log = getContractLog();
  const contract = log.find((e) => e.id === contractId);
  if (!contract) return null;
  const wf = getWorkflow(contract);
  if (wf.history[stage]) return contract; // already recorded
  const entry: StageCompletion = {
    ...completion,
    completedAt: completion.completedAt ?? new Date().toISOString(),
  };
  const next: ContractWorkflow = { ...wf, history: { ...wf.history, [stage]: entry } };
  return persistWorkflow(contractId, next) ?? contract;
}

/** Skip a single stage: records a "skipped" history entry and jumps currentStage to the one after. */
export function skipStageTo(
  contractId: string,
  target: WorkflowStage,
  opts: { skipNotes?: string } = {}
): ContractLogEntry {
  const log = getContractLog();
  const contract = log.find((e) => e.id === contractId);
  if (!contract) throw new Error(`Contract ${contractId} not found`);
  const wf = getWorkflow(contract);
  const currentIdx = STAGE_ORDER.indexOf(wf.currentStage);
  const targetIdx = STAGE_ORDER.indexOf(target);
  if (targetIdx === -1) throw new Error("Unknown stage");
  if (targetIdx <= currentIdx) throw new Error("Cannot skip backwards");

  const now = new Date().toISOString();
  const newHistory = { ...wf.history };
  // Mark every intermediate stage (between current+1 and target-1 inclusive) as skipped
  for (let i = currentIdx + 1; i < targetIdx; i++) {
    const s = STAGE_ORDER[i];
    if (!newHistory[s]) {
      newHistory[s] = { completedAt: now, by: "manual", notes: opts.skipNotes ?? "skipped" };
    }
  }
  newHistory[target] = { completedAt: now, by: "manual" };
  const next: ContractWorkflow = { ...wf, currentStage: target, history: newHistory };
  const updated = persistWorkflow(contractId, next);
  if (!updated) throw new Error(`Contract ${contractId} disappeared during update`);
  return updated;
}

/** Initialize workflow on contract submission. Backfills "costed" if finance has cost lines. */
export function initializeWorkflowOnSubmit(contractNo: string, submittedAt: string): ContractWorkflow {
  const history: Partial<Record<WorkflowStage, StageCompletion>> = {
    "docs-generated": { completedAt: submittedAt, by: "auto" },
  };
  // Backfill "costed" if any cost line > 0 exists for this contract
  try {
    const finance = getFinance(contractNo);
    if (finance && finance.costs.some((c) => c.amount > 0)) {
      history["costed"] = { completedAt: finance.updatedAt || submittedAt, by: "auto", notes: "backfilled from finance" };
    }
  } catch {
    // finance lookup fails gracefully
  }
  return { currentStage: "docs-generated", history };
}

/* ──────────────────── Cert refs ──────────────────── */

export function setCertRef(
  contractId: string,
  certType: RequiredCert,
  ref: ContractCertRef
): ContractLogEntry | null {
  const log = getContractLog();
  const contract = log.find((e) => e.id === contractId);
  if (!contract) return null;
  const wf = getWorkflow(contract);
  const next: ContractWorkflow = {
    ...wf,
    certs: { ...(wf.certs ?? {}), [certType]: ref },
  };
  return persistWorkflow(contractId, next);
}

export function clearCertRef(contractId: string, certType: RequiredCert): ContractLogEntry | null {
  const log = getContractLog();
  const contract = log.find((e) => e.id === contractId);
  if (!contract) return null;
  const wf = getWorkflow(contract);
  if (!wf.certs || !wf.certs[certType]) return contract;
  const nextCerts = { ...wf.certs };
  delete nextCerts[certType];
  const next: ContractWorkflow = { ...wf, certs: nextCerts };
  return persistWorkflow(contractId, next);
}

export function getRequiredCertsForStage6(): RequiredCert[] {
  return ["co", "health", "phyto"];
}

export function missingCertsForStage6(contract: ContractLogEntry): RequiredCert[] {
  const wf = getWorkflow(contract);
  const required = getRequiredCertsForStage6();
  return required.filter((c) => !wf.certs?.[c]);
}

/* ──────────────────── Lookups ──────────────────── */

export function findContractById(contractId: string): ContractLogEntry | undefined {
  return getContractLog().find((e) => e.id === contractId);
}

export function findContractByNo(contractNo: string): ContractLogEntry | undefined {
  return getContractLog().find((e) => e.contractNo === contractNo);
}
