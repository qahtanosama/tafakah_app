"use server";

/**
 * Finance server action (Supabase-only data layer — Batch 2).
 *
 * Upserts the per-contract finance row (cost_items + payments_received jsonb).
 * Adapted from migrateFinance() in src/app/(team)/admin/migrate/actions.ts,
 * switched from insert-only to upsert on the contract_id primary key.
 *
 * Reads happen client-side via RLS (see src/lib/data/finance.ts).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamUser } from "@/lib/auth/require-team";
import type { CostItem, PaymentItem } from "@/types/finance";

export async function saveContractFinance(params: {
  contractId: string;
  costs: CostItem[];
  payments: PaymentItem[];
  rmbUsdRate?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!params.contractId) return { ok: false, error: "Missing contractId" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("contract_finance")
    .upsert(
      {
        contract_id: params.contractId,
        cost_items: params.costs ?? [],
        payments_received: params.payments ?? [],
        // Normalize: only persist a positive rate, else null.
        rmb_usd_rate:
          typeof params.rmbUsdRate === "number" && params.rmbUsdRate > 0
            ? params.rmbUsdRate
            : null,
      },
      { onConflict: "contract_id" }
    );
  if (error) return { ok: false, error: `Save failed: ${error.message}` };
  return { ok: true };
}
