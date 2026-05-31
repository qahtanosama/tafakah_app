/**
 * Single shared builder for the `data` + `totals` props fed to the document PDF
 * components (SC / CI / Customs / PL / Freight).
 *
 * Both the TEAM forms and the PORTAL route call this so they feed the SAME data
 * to the SAME components — making the two copies byte-identical by construction
 * (stamp, consignee, bank, incoterm, ports, B/L, containers, totals all match).
 *
 * This is the canonical "fold": the frozen `master_snapshot` overlaid with the
 * live `bl_number` + `containers` columns (which are edited later on the
 * Shipping Docs page). Totals are recomputed with `calcTotals` exactly as the
 * team forms do.
 *
 * Pure module (no "use server", no React hooks) so it is safe to import from
 * both client components and the Node.js PDF route.
 */

import { calcTotals } from "@/lib/sales-contract";
import type { SalesContractData, ContractTotals } from "@/types/sales-contract";
import type { ContractContainer } from "@/types/contract";

/** Minimal contract-row shape the builder needs. */
export interface ContractDocSource {
  master_snapshot: SalesContractData | null;
  bl_number: string | null;
  containers: ContractContainer[] | null;
}

/**
 * Returns the `{ data, totals }` to feed the PDF components, or `null` when the
 * contract has no `master_snapshot` (parity with the team's empty state — the
 * portal route maps this to a 404).
 */
export function buildContractDocumentData(
  row: ContractDocSource
): { data: SalesContractData; totals: ContractTotals } | null {
  const snap = row.master_snapshot;
  if (!snap) return null;

  const data: SalesContractData = {
    ...snap,
    blNumber: row.bl_number ?? null,
    containers: row.containers ?? [],
  };
  const totals = calcTotals(data.lineItems, data.terms?.numberOfContainers);
  return { data, totals };
}
