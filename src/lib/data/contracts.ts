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
import type { WorkflowStage, StageCompletion } from "@/types/workflow";
import type { ContractContainer } from "@/types/contract";
import {
  saveContract,
  deleteContract,
  advanceStage,
  getNextSequence,
  setContractStatus,
} from "@/app/(team)/contract-log/actions";

/** Row shape of public.contracts (post-migration B). */
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
  workflow_history: Partial<Record<WorkflowStage, StageCompletion>>;
  bl_number: string | null;
  containers: ContractContainer[];
  master_snapshot: SalesContractData | null;
  product_label: string | null;
  status: "Active" | "Completed" | "Cancelled";
  created_at: string;
  updated_at: string;
}

function useRealtimeContracts() {
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("public:contracts")
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, () => {
        qc.invalidateQueries({ queryKey: ["contracts"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);
}

/** List all contracts the current user may see (RLS-scoped). */
export function useContracts() {
  useRealtimeContracts();
  return useQuery<ContractRow[]>({
    queryKey: ["contracts"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ContractRow[];
    },
  });
}

/** Fetch a single contract (with full master_snapshot) by id. */
export function useContract(id: string | undefined) {
  return useQuery<ContractRow | null>({
    queryKey: ["contracts", id],
    enabled: !!id,
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
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["contracts", vars.contractId] });
    },
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
