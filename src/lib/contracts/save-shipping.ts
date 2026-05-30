"use server";

/**
 * Shipping server action (Supabase-only data layer — Batch 2).
 *
 * Full-fidelity upsert into contract_shipping, including the columns added in
 * migration 20260530_100200 (booking_ref, cutoff_date, loading_date, ports,
 * seal_number, notes, status_override, shipsgo_request_id, last_auto_fetch_at).
 * Adapted from migrateShipping() in admin/migrate/actions.ts.
 *
 * B/L number + container list canonical handling stays on the `contracts` row
 * via src/lib/contracts/update-shipping.ts (updateContractContainers); that is
 * what the PDFs and portal read. We mirror bl_number / container_numbers onto
 * the shipping row too for convenience, but update-shipping remains the source
 * of truth for documents.
 *
 * Reads happen client-side via RLS (see src/lib/data/shipping.ts).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamUser } from "@/lib/auth/require-team";

export interface ShippingInput {
  shippingLine?: string | null;
  bookingRef?: string | null;
  vesselName?: string | null;
  voyageNumber?: string | null;
  blNumber?: string | null;
  cutoffDate?: string | null;
  loadingDate?: string | null;
  etd?: string | null;
  atd?: string | null;
  eta?: string | null;
  ata?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  containerNumber?: string | null;
  sealNumber?: string | null;
  statusOverride?: string | null;
  notes?: string | null;
  shipsgoData?: unknown;
  shipsgoRequestId?: string | null;
  lastAutoFetchAt?: string | null;
}

/** Postgres `date` columns reject empty strings; coerce "" → null. */
function normalizeDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Map the app's 6-value statusOverride onto the contract_shipping.status enum. */
function mapStatus(
  override: string | null | undefined
): "pending" | "in-transit" | "delivered" | "delayed" | "cancelled" | null {
  switch (override) {
    case "pending":
      return "pending";
    case "at_sea":
      return "in-transit";
    case "delivered":
      return "delivered";
    case "delayed":
      return "delayed";
    case "cancelled":
      return "cancelled";
    // "auto" (or unset) → leave status null; the UI derives it from dates.
    default:
      return null;
  }
}

export async function saveContractShipping(params: {
  contractId: string;
  shipping: ShippingInput;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!params.contractId) return { ok: false, error: "Missing contractId" };

  const s = params.shipping;
  const admin = createAdminClient();

  const { error } = await admin.from("contract_shipping").upsert(
    {
      contract_id: params.contractId,
      etd: normalizeDate(s.etd),
      atd: normalizeDate(s.atd),
      eta: normalizeDate(s.eta),
      ata: normalizeDate(s.ata),
      carrier: s.shippingLine || null,
      vessel: s.vesselName || null,
      voyage: s.voyageNumber || null,
      bl_number: s.blNumber || null,
      container_numbers: s.containerNumber ? [s.containerNumber] : null,
      booking_ref: s.bookingRef || null,
      cutoff_date: normalizeDate(s.cutoffDate),
      loading_date: normalizeDate(s.loadingDate),
      port_of_loading: s.portOfLoading || null,
      port_of_discharge: s.portOfDischarge || null,
      seal_number: s.sealNumber || null,
      notes: s.notes || null,
      status_override: s.statusOverride || null,
      status: mapStatus(s.statusOverride),
      shipsgo_data: s.shipsgoData ?? null,
      shipsgo_request_id: s.shipsgoRequestId || null,
      last_auto_fetch_at: s.lastAutoFetchAt || null,
    },
    { onConflict: "contract_id" }
  );
  if (error) return { ok: false, error: `Save failed: ${error.message}` };
  return { ok: true };
}
