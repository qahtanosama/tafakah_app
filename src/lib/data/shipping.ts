"use client";

/**
 * Supabase-backed shipping data layer (Batch 2).
 *
 * Reads via the authed browser client (RLS-scoped); writes via the
 * saveContractShipping server action. Returns the full contract_shipping row
 * including the fidelity columns added in migration 20260530_100200.
 *
 * Keyed by the contract UUID (contract_id). B/L + containers canonical handling
 * stays on the contracts row via update-shipping.ts.
 *
 * NEW parallel layer — the localStorage path (src/lib/shipping.ts) is untouched
 * until Batch 3.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { saveContractShipping, type ShippingInput } from "@/lib/contracts/save-shipping";

/** Row shape of public.contract_shipping (post-migration C). */
export interface ShippingRow {
  contract_id: string;
  etd: string | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
  carrier: string | null;
  vessel: string | null;
  voyage: string | null;
  bl_number: string | null;
  container_numbers: string[] | null;
  booking_ref: string | null;
  cutoff_date: string | null;
  loading_date: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  seal_number: string | null;
  notes: string | null;
  status: string | null;
  status_override: string | null;
  shipsgo_data: unknown;
  shipsgo_request_id: string | null;
  last_auto_fetch_at: string | null;
  updated_at: string;
}

export type { ShippingInput };

/** Fetch the shipping row for a contract (null if none yet). */
export function useShipping(contractId: string | undefined) {
  return useQuery<ShippingRow | null>({
    queryKey: ["contract_shipping", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contract_shipping")
        .select("*")
        .eq("contract_id", contractId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ShippingRow) ?? null;
    },
  });
}

/** Full-fidelity upsert of a contract's shipping row. */
export function useSaveShipping(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shipping: ShippingInput) => {
      const res = await saveContractShipping({ contractId, shipping });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["contract_shipping", contractId] });
    },
  });
}
