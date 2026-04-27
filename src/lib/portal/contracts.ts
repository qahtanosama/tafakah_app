import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PortalContractRow {
  id: string;
  contract_no: string;
  invoice_no: string;
  current_stage: string;
  totals: { totalUSD?: number } | null;
  contract_date: string | null;
}

export interface PortalContractSummary {
  id: string;
  contractNo: string;
  invoiceNo: string;
  stage: string;
  totalUSD: number;
  totalReceived: number;
  etd: string | null;
  eta: string | null;
}

interface ShippingRow {
  contract_id: string;
  etd: string | null;
  eta: string | null;
}

interface FinanceRow {
  contract_id: string;
  payments_received: { amount?: number }[] | null;
}

/**
 * Loads all contracts visible to the signed-in client (RLS scopes by buyer_id).
 * Strips internal-only fields. Aggregates payments and shipping for the dashboard.
 */
export async function loadClientContracts(
  supabase: SupabaseClient
): Promise<PortalContractSummary[]> {
  const { data: contractRows } = await supabase
    .from("contracts")
    .select("id, contract_no, invoice_no, current_stage, totals, contract_date")
    .order("created_at", { ascending: false });

  const contracts = (contractRows ?? []) as PortalContractRow[];
  if (contracts.length === 0) return [];

  const ids = contracts.map((c) => c.id);

  const [{ data: shipping }, { data: finance }] = await Promise.all([
    supabase.from("contract_shipping").select("contract_id, etd, eta").in("contract_id", ids),
    supabase.from("contract_finance").select("contract_id, payments_received").in("contract_id", ids),
  ]);

  const shippingMap = new Map<string, ShippingRow>();
  for (const s of (shipping ?? []) as ShippingRow[]) shippingMap.set(s.contract_id, s);

  const financeMap = new Map<string, number>();
  for (const f of (finance ?? []) as FinanceRow[]) {
    const total = (f.payments_received ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    financeMap.set(f.contract_id, total);
  }

  return contracts.map((c) => ({
    id: c.id,
    contractNo: c.contract_no,
    invoiceNo: c.invoice_no,
    stage: c.current_stage,
    totalUSD: Number(c.totals?.totalUSD ?? 0),
    totalReceived: financeMap.get(c.id) ?? 0,
    etd: shippingMap.get(c.id)?.etd ?? null,
    eta: shippingMap.get(c.id)?.eta ?? null,
  }));
}
