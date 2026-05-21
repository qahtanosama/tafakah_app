"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamUser } from "@/lib/auth/require-team";
import {
  isValidContainerNumber,
  normalizeContainerNumber,
} from "@/lib/utils/container-number";

export type UpdateContractContainersResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateContractContainers(params: {
  contractId: string;
  blNumber: string | null;
  containers: string[];
}): Promise<UpdateContractContainersResult> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };

  const normalized = params.containers
    .map((c) => normalizeContainerNumber(c))
    .filter((c) => c.length > 0);

  for (const num of normalized) {
    if (!isValidContainerNumber(num)) {
      return {
        ok: false,
        error: `Invalid container number format: "${num}". Expected 4 letters + 7 digits (e.g., MSKU1234567).`,
      };
    }
  }

  const unique = Array.from(new Set(normalized));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      bl_number: params.blNumber?.trim() || null,
      containers: unique.map((number) => ({ number })),
    })
    .eq("id", params.contractId);

  if (error) return { ok: false, error: `Update failed: ${error.message}` };
  return { ok: true };
}

export async function getContractContainers(params: {
  contractId: string;
}): Promise<
  | { ok: true; blNumber: string | null; containers: string[] }
  | { ok: false; error: string }
> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("bl_number, containers")
    .eq("id", params.contractId)
    .maybeSingle();

  if (error) return { ok: false, error: `Load failed: ${error.message}` };
  if (!data) return { ok: false, error: "Contract not found" };

  const rawContainers = (data.containers ?? []) as Array<{ number?: unknown }>;
  const containers = rawContainers
    .map((c) => (typeof c?.number === "string" ? c.number : ""))
    .filter((n) => n.length > 0);

  return {
    ok: true,
    blNumber: (data.bl_number as string | null) ?? null,
    containers,
  };
}

/**
 * Resolve a Supabase contract `id` from its human-readable `contract_no`.
 * The Shipping Tracker UI is keyed by contractNo (URL slug) but the new
 * `contracts.bl_number` / `contracts.containers` columns live on a uuid-keyed
 * row, so the client needs this lookup before save.
 */
export async function getContractIdByNo(params: {
  contractNo: string;
}): Promise<
  { ok: true; contractId: string } | { ok: false; error: string }
> {
  const guard = await requireTeamUser();
  if (!guard.ok) return { ok: false, error: guard.error };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("id")
    .eq("contract_no", params.contractNo)
    .maybeSingle();

  if (error) return { ok: false, error: `Lookup failed: ${error.message}` };
  if (!data) {
    return {
      ok: false,
      error: `Contract "${params.contractNo}" has not been synced to the cloud yet. Submit it from Master Data first.`,
    };
  }
  return { ok: true, contractId: data.id as string };
}
