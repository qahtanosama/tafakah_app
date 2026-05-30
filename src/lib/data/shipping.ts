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
import type { ShippingEntry, ShippingLine, ShippingStatusOverride } from "@/types/shipping";

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

/** Fetch all shipping rows the user may see (RLS-scoped), keyed by contract_id. */
export function useAllShipping() {
  return useQuery<Record<string, ShippingRow>>({
    queryKey: ["contract_shipping", "all"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("contract_shipping").select("*");
      if (error) throw error;
      const map: Record<string, ShippingRow> = {};
      for (const r of (data as unknown as ShippingRow[]) ?? []) map[r.contract_id] = r;
      return map;
    },
  });
}

/** Map a Supabase contract_shipping row to the app's ShippingEntry shape. */
export function shippingRowToEntry(contractNo: string, row: ShippingRow): ShippingEntry {
  return {
    contractNo,
    shippingLine: (row.carrier ?? "") as ShippingLine,
    bookingRef: row.booking_ref ?? "",
    vesselName: row.vessel ?? "",
    voyageNumber: row.voyage ?? "",
    blNumber: row.bl_number ?? "",
    cutoffDate: row.cutoff_date ?? "",
    loadingDate: row.loading_date ?? "",
    etd: row.etd ?? "",
    atd: row.atd,
    eta: row.eta ?? "",
    ata: row.ata,
    portOfLoading: row.port_of_loading ?? "",
    portOfDischarge: row.port_of_discharge ?? "",
    containerNumber: row.container_numbers?.[0] ?? "",
    sealNumber: row.seal_number ?? "",
    statusOverride: (row.status_override ?? "auto") as ShippingStatusOverride,
    notes: row.notes ?? "",
    updatedAt: row.updated_at ?? "",
    shipsgoRequestId: row.shipsgo_request_id ?? null,
    lastAutoFetchAt: row.last_auto_fetch_at ?? null,
  };
}

/** Map an app ShippingEntry to the server action's ShippingInput. */
export function shippingEntryToInput(e: ShippingEntry): ShippingInput {
  return {
    shippingLine: e.shippingLine || null,
    bookingRef: e.bookingRef || null,
    vesselName: e.vesselName || null,
    voyageNumber: e.voyageNumber || null,
    blNumber: e.blNumber || null,
    cutoffDate: e.cutoffDate || null,
    loadingDate: e.loadingDate || null,
    etd: e.etd || null,
    atd: e.atd,
    eta: e.eta || null,
    ata: e.ata,
    portOfLoading: e.portOfLoading || null,
    portOfDischarge: e.portOfDischarge || null,
    containerNumber: e.containerNumber || null,
    sealNumber: e.sealNumber || null,
    statusOverride: e.statusOverride || null,
    notes: e.notes || null,
    shipsgoData: undefined,
    shipsgoRequestId: e.shipsgoRequestId,
    lastAutoFetchAt: e.lastAutoFetchAt,
  };
}

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
