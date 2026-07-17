"use client";

/**
 * Supabase-backed contracts data layer (Batch 2).
 *
 * Reads go through the authed browser client; RLS scopes rows automatically
 * (super_admin/team see all, client sees own — see migration 20260421_000002).
 * Writes call the server actions in src/app/(team)/contract-log/actions.ts.
 *
 * Pattern mirrors src/lib/data/buyers.ts. This is a NEW parallel layer — no UI
 * consumes it yet; the localStorage path (src/lib/contract-log.ts, workflow.ts)
 * is untouched until Batch 3.
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { SalesContractData } from "@/types/sales-contract";
import type {
  WorkflowStage,
  StageCompletion,
  WorkflowHistory,
  ContractCertRef,
  RequiredCert,
} from "@/types/workflow";
import type { ContractContainer } from "@/types/contract";
import {
  saveContract,
  editContract,
  deleteContract,
  advanceStage,
  skipStage,
  backfillStage,
  setContractCertRef,
  clearContractCertRef,
  getNextSequence,
  setContractStatus,
} from "@/app/(team)/contract-log/actions";

/** Row shape of public.contracts. `workflow_history` jsonb = { history, certs }. */
export interface ContractRow {
  id: string;
  contract_no: string;
  invoice_no: string;
  buyer_id: string | null;
  seller_id: string | null;
  contract_date: string | null;
  line_items: unknown;
  terms: unknown;
  totals: unknown;
  current_stage: WorkflowStage;
  workflow_history: WorkflowHistory;
  bl_number: string | null;
  containers: ContractContainer[];
  master_snapshot: SalesContractData | null;
  product_label: string | null;
  status: "Active" | "Completed" | "Cancelled";
  created_at: string;
  updated_at: string;
}

/**
 * Snapshot fragments the LIST query carries — just what tables and analytics
 * read (buyer name, line items, incoterm, container count, seller link). The
 * heavy parts (seller block with its base64 stamp image, bank details,
 * identifiers, notes) load per-contract via useContract/useContractByNo only.
 */
export type ContractListSnapshot = Partial<
  Pick<SalesContractData, "buyer" | "shipping" | "lineItems" | "terms" | "sellerId">
>;

/** Slim list row. Anything needing the full snapshot must fetch the single contract. */
export interface ContractListRow
  extends Omit<ContractRow, "master_snapshot" | "line_items" | "terms" | "totals"> {
  master_snapshot: ContractListSnapshot | null;
}

/** Newest-first cap for the list — keeps payloads bounded as history grows. */
const LIST_LIMIT = 500;

const LIST_SELECT =
  "id, contract_no, invoice_no, buyer_id, seller_id, contract_date, current_stage, " +
  "workflow_history, bl_number, containers, product_label, status, created_at, updated_at, " +
  "ms_buyer:master_snapshot->buyer, ms_shipping:master_snapshot->shipping, " +
  "ms_line_items:master_snapshot->lineItems, ms_terms:master_snapshot->terms, " +
  "ms_seller_id:master_snapshot->>sellerId";

interface RawListRow extends Omit<ContractListRow, "master_snapshot"> {
  ms_buyer: SalesContractData["buyer"] | null;
  ms_shipping: SalesContractData["shipping"] | null;
  ms_line_items: SalesContractData["lineItems"] | null;
  ms_terms: SalesContractData["terms"] | null;
  ms_seller_id: string | null;
}

function toListRow(raw: RawListRow): ContractListRow {
  const { ms_buyer, ms_shipping, ms_line_items, ms_terms, ms_seller_id, ...rest } = raw;
  const hasSnapshot = ms_buyer || ms_shipping || ms_line_items || ms_terms || ms_seller_id;
  return {
    ...rest,
    master_snapshot: hasSnapshot
      ? {
          buyer: ms_buyer ?? undefined,
          shipping: ms_shipping ?? undefined,
          lineItems: ms_line_items ?? undefined,
          terms: ms_terms ?? undefined,
          sellerId: ms_seller_id ?? undefined,
        }
      : null,
  };
}

function useRealtimeContracts() {
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    // Unique channel name per mount — see note in data/buyers.ts (Strict Mode).
    const channelName = `public:contracts:${Math.random().toString(36).slice(2, 9)}`;
    const ch = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, () => {
        qc.invalidateQueries({ queryKey: ["contracts"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);
}

/**
 * List all contracts the current user may see (RLS-scoped), as slim rows:
 * scalar columns plus only the snapshot fragments list UIs read. Cuts the
 * payload from ~full-history-of-everything (every row used to carry bank
 * details and a base64 stamp image) to a bounded, mostly-scalar list.
 */
export function useContracts() {
  useRealtimeContracts();
  return useQuery<ContractListRow[]>({
    queryKey: ["contracts"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contracts")
        .select(LIST_SELECT)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw error;
      return (data as unknown as RawListRow[]).map(toListRow);
    },
  });
}

/** Fetch a single contract by its human contract_no (for routed detail pages). */
export function useContractByNo(contractNo: string | undefined) {
  return useQuery<ContractRow | null>({
    queryKey: ["contracts", "by-no", contractNo],
    enabled: !!contractNo,
    // Always refetch on mount — B/L + containers are saved on a different page
    // (Shipping Docs), so the doc generators must read the latest contract row.
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("contract_no", contractNo!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ContractRow) ?? null;
    },
  });
}

/** Fetch a single contract (with full master_snapshot) by id. */
export function useContract(id: string | undefined) {
  return useQuery<ContractRow | null>({
    queryKey: ["contracts", id],
    enabled: !!id,
    // Always refetch on mount — the PDF generators (CI/PL/SC/Freight) rely on
    // the freshest B/L + containers, which are saved on the Shipping Docs page.
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ContractRow) ?? null;
    },
  });
}

/** Upsert a contract from the Master Data form shape. */
export function useSaveContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalesContractData & { id?: string }) => {
      const res = await saveContract(input);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });
}

/**
 * Super-admin contract correction. Overwrites the existing contract's editable
 * content + master_snapshot (numbers/workflow/status preserved) and writes an
 * audit_log row. Invalidates the contracts cache so every doc re-reads the fix.
 */
export function useEditContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalesContractData & { id: string }) => {
      const res = await editContract(input);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["contracts"], refetchType: "all" });
    },
  });
}

/** Delete a contract (soft → status='Cancelled' by default; pass hard:true to remove). */
export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; hard?: boolean }) => {
      const res = await deleteContract(params);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });
}

/** Set a contract's business status (Active / Completed / Cancelled). */
export function useSetContractStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; status: "Active" | "Completed" | "Cancelled" }) => {
      const res = await setContractStatus(params);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });
}

/** Advance / set a contract's workflow stage. */
export function useAdvanceStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      contractId: string;
      newStage: WorkflowStage;
      completion?: Omit<StageCompletion, "completedAt">;
    }) => {
      const res = await advanceStage(params);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });
}

/** Skip to a target stage (marks intermediate stages skipped). */
export function useSkipStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { contractId: string; targetStage: WorkflowStage; skipNotes?: string }) => {
      const res = await skipStage(params);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); },
  });
}

/** Backfill a completed stage without changing the current stage. */
export function useBackfillStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { contractId: string; stage: WorkflowStage; completion?: Omit<StageCompletion, "completedAt"> & { completedAt?: string } }) => {
      const res = await backfillStage(params);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); },
  });
}

/** Attach a certificate reference (co/health/phyto). */
export function useSetCertRef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { contractId: string; certType: RequiredCert; ref: ContractCertRef }) => {
      const res = await setContractCertRef(params);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); },
  });
}

/** Remove a certificate reference. */
export function useClearCertRef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { contractId: string; certType: RequiredCert }) => {
      const res = await clearContractCertRef(params);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); },
  });
}

/** Race-safe next contract sequence for (year, prefix) via DB RPC. */
export function useNextSequence(year: number | undefined, prefix: string | undefined) {
  return useQuery<number>({
    queryKey: ["next-contract-sequence", year, prefix],
    enabled: !!year && !!prefix,
    queryFn: async () => {
      const res = await getNextSequence({ year: year!, prefix: prefix! });
      if (!res.ok) throw new Error(res.error);
      return res.sequence;
    },
  });
}
