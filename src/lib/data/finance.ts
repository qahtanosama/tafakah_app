"use client";

/**
 * Supabase-backed finance data layer (Batch 2).
 *
 * Reads via the authed browser client (RLS-scoped); writes via the
 * saveContractFinance server action. Keyed by the contract UUID (contract_id),
 * NOT the human contract number.
 *
 * NEW parallel layer — the localStorage path (src/lib/finance.ts) is untouched
 * until Batch 3.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CostItem, PaymentItem } from "@/types/finance";
import { saveContractFinance } from "@/lib/contracts/save-finance";

/** Row shape of public.contract_finance. */
export interface FinanceRow {
  contract_id: string;
  cost_items: CostItem[];
  payments_received: PaymentItem[];
  updated_at: string;
}

/** Fetch the finance row for a contract (null if none yet). */
export function useFinance(contractId: string | undefined) {
  return useQuery<FinanceRow | null>({
    queryKey: ["contract_finance", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contract_finance")
        .select("*")
        .eq("contract_id", contractId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as FinanceRow) ?? null;
    },
  });
}

/** Upsert costs + payments for a contract. */
export function useSaveFinance(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      costs,
      payments,
    }: {
      costs: CostItem[];
      payments: PaymentItem[];
    }) => {
      const res = await saveContractFinance({ contractId, costs, payments });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["contract_finance", contractId] });
    },
  });
}
