"use server";

/**
 * Per-entity migration server actions.
 *
 * Each action:
 *   1. Requires the caller to be an active team user.
 *   2. Uses the service-role admin client to bypass RLS during inserts.
 *   3. Pre-fetches existing rows by unique key and skips duplicates.
 *   4. Inserts new rows in batches of 25 with a 50ms pause between batches and
 *      up to 3 retries on network errors.
 *   5. Returns a per-entity result plus a localId → uuid mapping for FK resolution.
 *
 * NEVER import `@/lib/supabase/admin` from a client component — these actions are the only entry point.
 */

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EntityMigrationResult,
  MigrationEntity,
  MigrationError,
} from "@/lib/migration/types";

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

async function requireTeam(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Not signed in" };
  const { data: profile } = await supabase
    .from("users_profile")
    .select("role, is_active")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role !== "team" || !profile.is_active) {
    return { ok: false, error: "Team access required" };
  }
  return { ok: true };
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function emptyResult(entity: MigrationEntity, localCount: number): EntityMigrationResult {
  return { entity, localCount, migratedCount: 0, failedCount: 0, skippedExisting: 0, errors: [] };
}

async function withRetries<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastErr;
}

/* ═════════════════════════ PRODUCTS ═════════════════════════ */

export interface ProductPayload {
  localId: string;
  name: string;
  nameAr?: string | null;
  nameZh?: string | null;
  prefix: string;
  hsCode: string;
}

export async function migrateProducts(
  payload: { items: ProductPayload[]; dryRun: boolean }
): Promise<{ ok: boolean; error?: string; result?: EntityMigrationResult; mappings?: Record<string, string> }> {
  const guard = await requireTeam();
  if (!guard.ok) return { ok: false, error: guard.error };

  const res = emptyResult("products", payload.items.length);
  const mappings: Record<string, string> = {};

  if (payload.items.length === 0) return { ok: true, result: res, mappings };

  const admin = createAdminClient();

  // Fetch existing prefixes
  const { data: existing, error: selErr } = await admin.from("products").select("id, prefix, name");
  if (selErr) return { ok: false, error: `Fetch existing products failed: ${selErr.message}` };
  const existingByPrefix = new Map<string, string>();
  const existingByName = new Map<string, string>();
  for (const row of (existing ?? []) as Array<{ id: string; prefix: string; name: string }>) {
    existingByPrefix.set(row.prefix.toLowerCase(), row.id);
    existingByName.set(row.name.toLowerCase(), row.id);
  }

  const toInsert: ProductPayload[] = [];
  for (const item of payload.items) {
    if (!item.name || !item.prefix || !item.hsCode) {
      res.failedCount++;
      res.errors.push({ id: item.localId, message: "Missing required field (name, prefix, hs_code)", item });
      continue;
    }
    const existingId = existingByPrefix.get(item.prefix.toLowerCase()) ?? existingByName.get(item.name.toLowerCase());
    if (existingId) {
      mappings[item.localId] = existingId;
      res.skippedExisting++;
      continue;
    }
    toInsert.push(item);
  }

  if (payload.dryRun) {
    res.migratedCount += toInsert.length;
    for (const item of toInsert) mappings[item.localId] = `dry-run-${item.localId}`;
    return { ok: true, result: res, mappings };
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    try {
      const rows = batch.map((p) => ({
        name: p.name,
        name_ar: p.nameAr ?? null,
        name_zh: p.nameZh ?? null,
        prefix: p.prefix,
        hs_code: p.hsCode,
      }));
      const inserted = await withRetries(async () => {
        const { data, error } = await admin.from("products").insert(rows).select("id, prefix");
        if (error) throw error;
        return data ?? [];
      });
      const byPrefix = new Map<string, string>();
      for (const r of inserted as Array<{ id: string; prefix: string }>) {
        byPrefix.set(r.prefix.toLowerCase(), r.id);
      }
      for (const p of batch) {
        const newId = byPrefix.get(p.prefix.toLowerCase());
        if (newId) {
          mappings[p.localId] = newId;
          res.migratedCount++;
        } else {
          res.failedCount++;
          res.errors.push({ id: p.localId, message: "No id returned after insert", item: p });
        }
      }
    } catch (err) {
      // Fallback: try per-item so one bad row doesn't fail the whole batch
      for (const p of batch) {
        try {
          const { data, error } = await admin
            .from("products")
            .insert({ name: p.name, name_ar: p.nameAr ?? null, name_zh: p.nameZh ?? null, prefix: p.prefix, hs_code: p.hsCode })
            .select("id")
            .single();
          if (error) throw error;
          mappings[p.localId] = (data as { id: string }).id;
          res.migratedCount++;
        } catch (e) {
          res.failedCount++;
          res.errors.push({ id: p.localId, message: (e as Error).message, item: p });
        }
      }
      void err;
    }
    await sleep(BATCH_DELAY_MS);
  }

  return { ok: true, result: res, mappings };
}

/* ═════════════════════════ BUYERS ═════════════════════════ */

export interface BuyerPayload {
  localId: string;
  companyName: string;
  companyNameCn?: string | null;
  contactName: string;
  whatsappNumber?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  preferredLanguage?: "en" | "ar" | "zh" | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  defaultDocPreset?: "buyer" | "bank" | "customs" | "all" | null;
  customMessageTemplate?: Record<string, unknown> | null;
  notes?: string | null;
}

function buyerKey(name: string, country: string | null | undefined): string {
  return `${(name ?? "").trim().toLowerCase()}|${(country ?? "").trim().toLowerCase()}`;
}

export async function migrateBuyers(
  payload: { items: BuyerPayload[]; dryRun: boolean }
): Promise<{ ok: boolean; error?: string; result?: EntityMigrationResult; mappings?: Record<string, string> }> {
  const guard = await requireTeam();
  if (!guard.ok) return { ok: false, error: guard.error };

  const res = emptyResult("buyers", payload.items.length);
  const mappings: Record<string, string> = {};
  if (payload.items.length === 0) return { ok: true, result: res, mappings };

  const admin = createAdminClient();

  const { data: existing, error: selErr } = await admin.from("buyers").select("id, company_name, country");
  if (selErr) return { ok: false, error: `Fetch existing buyers failed: ${selErr.message}` };
  const existingByKey = new Map<string, string>();
  for (const row of (existing ?? []) as Array<{ id: string; company_name: string; country: string | null }>) {
    existingByKey.set(buyerKey(row.company_name, row.country), row.id);
  }

  const toInsert: BuyerPayload[] = [];
  for (const item of payload.items) {
    if (!item.companyName || !item.contactName) {
      res.failedCount++;
      res.errors.push({ id: item.localId, message: "Missing company_name or contact_name", item });
      continue;
    }
    const key = buyerKey(item.companyName, item.country);
    const existingId = existingByKey.get(key);
    if (existingId) {
      mappings[item.localId] = existingId;
      res.skippedExisting++;
      continue;
    }
    toInsert.push(item);
  }

  if (payload.dryRun) {
    res.migratedCount += toInsert.length;
    for (const item of toInsert) mappings[item.localId] = `dry-run-${item.localId}`;
    return { ok: true, result: res, mappings };
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    for (const b of batch) {
      try {
        const { data, error } = await withRetries(async () => admin
          .from("buyers")
          .insert({
            company_name: b.companyName,
            company_name_cn: b.companyNameCn ?? null,
            contact_name: b.contactName,
            whatsapp_number: b.whatsappNumber ?? null,
            phone_number: b.phoneNumber ?? null,
            email: b.email ?? null,
            preferred_language: b.preferredLanguage ?? null,
            country: b.country ?? null,
            city: b.city ?? null,
            address: b.address ?? null,
            default_doc_preset: b.defaultDocPreset ?? null,
            custom_message_template: b.customMessageTemplate ?? null,
            notes: b.notes ?? null,
          })
          .select("id")
          .single());
        if (error) throw error;
        mappings[b.localId] = (data as { id: string }).id;
        res.migratedCount++;
      } catch (err) {
        res.failedCount++;
        res.errors.push({ id: b.localId, message: (err as Error).message, item: b });
      }
    }
    await sleep(BATCH_DELAY_MS);
  }

  return { ok: true, result: res, mappings };
}

/* ═════════════════════════ SELLERS ═════════════════════════ */

export interface SellerPayload {
  localId: string;
  companyName: string;
  companyNameCn?: string | null;
  contactName: string;
  contactTitle?: string | null;
  whatsappNumber?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  preferredLanguage?: "en" | "ar" | "zh" | null;
  country: string;
  city?: string | null;
  address?: string | null;
  products: string[]; // uuids — already resolved client-side
  paymentTerms?: string | null;
  leadTimeDays?: number | null;
  bankDetails?: Record<string, unknown> | null;
  customMessageTemplate?: Record<string, unknown> | null;
  defaultDocPreset?: "factory" | "all" | null;
  notes?: string | null;
}

export async function migrateSellers(
  payload: { items: SellerPayload[]; dryRun: boolean }
): Promise<{ ok: boolean; error?: string; result?: EntityMigrationResult; mappings?: Record<string, string> }> {
  const guard = await requireTeam();
  if (!guard.ok) return { ok: false, error: guard.error };

  const res = emptyResult("sellers", payload.items.length);
  const mappings: Record<string, string> = {};
  if (payload.items.length === 0) return { ok: true, result: res, mappings };

  const admin = createAdminClient();

  const { data: existing, error: selErr } = await admin.from("sellers").select("id, company_name, country");
  if (selErr) return { ok: false, error: `Fetch existing sellers failed: ${selErr.message}` };
  const existingByKey = new Map<string, string>();
  for (const row of (existing ?? []) as Array<{ id: string; company_name: string; country: string }>) {
    existingByKey.set(buyerKey(row.company_name, row.country), row.id);
  }

  const toInsert: SellerPayload[] = [];
  for (const item of payload.items) {
    if (!item.companyName || !item.contactName || !item.country) {
      res.failedCount++;
      res.errors.push({ id: item.localId, message: "Missing company_name, contact_name, or country", item });
      continue;
    }
    const key = buyerKey(item.companyName, item.country);
    const existingId = existingByKey.get(key);
    if (existingId) {
      mappings[item.localId] = existingId;
      res.skippedExisting++;
      continue;
    }
    toInsert.push(item);
  }

  if (payload.dryRun) {
    res.migratedCount += toInsert.length;
    for (const item of toInsert) mappings[item.localId] = `dry-run-${item.localId}`;
    return { ok: true, result: res, mappings };
  }

  for (const s of toInsert) {
    try {
      const { data, error } = await withRetries(async () => admin
        .from("sellers")
        .insert({
          company_name: s.companyName,
          company_name_cn: s.companyNameCn ?? null,
          contact_name: s.contactName,
          contact_title: s.contactTitle ?? null,
          whatsapp_number: s.whatsappNumber ?? null,
          phone_number: s.phoneNumber ?? null,
          email: s.email ?? null,
          preferred_language: s.preferredLanguage ?? null,
          country: s.country,
          city: s.city ?? null,
          address: s.address ?? null,
          products: s.products ?? [],
          payment_terms: s.paymentTerms ?? null,
          lead_time_days: s.leadTimeDays ?? null,
          bank_details: s.bankDetails ?? null,
          custom_message_template: s.customMessageTemplate ?? null,
          default_doc_preset: s.defaultDocPreset ?? null,
          notes: s.notes ?? null,
        })
        .select("id")
        .single());
      if (error) throw error;
      mappings[s.localId] = (data as { id: string }).id;
      res.migratedCount++;
    } catch (err) {
      res.failedCount++;
      res.errors.push({ id: s.localId, message: (err as Error).message, item: s });
    }
    await sleep(BATCH_DELAY_MS);
  }

  return { ok: true, result: res, mappings };
}

/* ═════════════════════════ CONTRACTS ═════════════════════════ */

export interface ContractPayload {
  localId: string; // contract_no
  contractNo: string;
  invoiceNo: string;
  buyerId: string | null;   // uuid
  sellerId: string | null;  // uuid
  contractDate?: string | null;
  lineItems: unknown;  // jsonb
  terms?: unknown;
  totals?: unknown;
  currentStage: string;
  workflowHistory?: unknown;
}

export async function migrateContracts(
  payload: { items: ContractPayload[]; dryRun: boolean }
): Promise<{ ok: boolean; error?: string; result?: EntityMigrationResult; mappings?: Record<string, string> }> {
  const guard = await requireTeam();
  if (!guard.ok) return { ok: false, error: guard.error };

  const res = emptyResult("contracts", payload.items.length);
  const mappings: Record<string, string> = {};
  if (payload.items.length === 0) return { ok: true, result: res, mappings };

  const admin = createAdminClient();

  const { data: existing, error: selErr } = await admin.from("contracts").select("id, contract_no");
  if (selErr) return { ok: false, error: `Fetch existing contracts failed: ${selErr.message}` };
  const existingByNo = new Map<string, string>();
  for (const row of (existing ?? []) as Array<{ id: string; contract_no: string }>) {
    existingByNo.set(row.contract_no, row.id);
  }

  const toInsert: ContractPayload[] = [];
  for (const item of payload.items) {
    if (!item.contractNo || !item.invoiceNo || !item.lineItems) {
      res.failedCount++;
      res.errors.push({ id: item.localId, message: "Missing contract_no, invoice_no, or line_items", item });
      continue;
    }
    const existingId = existingByNo.get(item.contractNo);
    if (existingId) {
      mappings[item.localId] = existingId;
      res.skippedExisting++;
      continue;
    }
    toInsert.push(item);
  }

  if (payload.dryRun) {
    res.migratedCount += toInsert.length;
    for (const item of toInsert) mappings[item.localId] = `dry-run-${item.localId}`;
    return { ok: true, result: res, mappings };
  }

  for (const c of toInsert) {
    try {
      const { data, error } = await withRetries(async () => admin
        .from("contracts")
        .insert({
          contract_no: c.contractNo,
          invoice_no: c.invoiceNo,
          buyer_id: c.buyerId,
          seller_id: c.sellerId,
          contract_date: c.contractDate ?? null,
          line_items: c.lineItems,
          terms: c.terms ?? null,
          totals: c.totals ?? null,
          current_stage: c.currentStage,
          workflow_history: c.workflowHistory ?? {},
        })
        .select("id")
        .single());
      if (error) throw error;
      mappings[c.localId] = (data as { id: string }).id;
      res.migratedCount++;
    } catch (err) {
      res.failedCount++;
      res.errors.push({ id: c.localId, message: (err as Error).message, item: c });
    }
    await sleep(BATCH_DELAY_MS);
  }

  return { ok: true, result: res, mappings };
}

/* ═════════════════════════ FINANCE ═════════════════════════ */

export interface FinancePayload {
  contractId: string;  // uuid
  localContractNo?: string;
  costItems: unknown;
  paymentsReceived: unknown;
}

export async function migrateFinance(
  payload: { items: FinancePayload[]; dryRun: boolean }
): Promise<{ ok: boolean; error?: string; result?: EntityMigrationResult }> {
  const guard = await requireTeam();
  if (!guard.ok) return { ok: false, error: guard.error };

  const res = emptyResult("contract_finance", payload.items.length);
  if (payload.items.length === 0) return { ok: true, result: res };

  const admin = createAdminClient();

  const { data: existing } = await admin.from("contract_finance").select("contract_id");
  const existingIds = new Set<string>(
    ((existing ?? []) as Array<{ contract_id: string }>).map((r) => r.contract_id)
  );

  const toInsert: FinancePayload[] = [];
  for (const item of payload.items) {
    if (!item.contractId) {
      res.failedCount++;
      const errMsg: MigrationError = { id: item.localContractNo, message: "Contract FK not resolved", item };
      res.errors.push(errMsg);
      continue;
    }
    if (existingIds.has(item.contractId)) { res.skippedExisting++; continue; }
    toInsert.push(item);
  }

  if (payload.dryRun) {
    res.migratedCount += toInsert.length;
    return { ok: true, result: res };
  }

  for (const f of toInsert) {
    try {
      const { error } = await withRetries(async () => admin.from("contract_finance").insert({
        contract_id: f.contractId,
        cost_items: f.costItems,
        payments_received: f.paymentsReceived,
      }));
      if (error) throw error;
      res.migratedCount++;
    } catch (err) {
      res.failedCount++;
      res.errors.push({ id: f.localContractNo, message: (err as Error).message, item: f });
    }
    await sleep(BATCH_DELAY_MS);
  }
  return { ok: true, result: res };
}

/* ═════════════════════════ SHIPPING ═════════════════════════ */

export interface ShippingPayload {
  contractId: string;
  localContractNo?: string;
  etd?: string | null;
  atd?: string | null;
  eta?: string | null;
  ata?: string | null;
  carrier?: string | null;
  vessel?: string | null;
  voyage?: string | null;
  blNumber?: string | null;
  containerNumbers?: string[] | null;
  shipsgoData?: unknown;
  status?: "pending" | "in-transit" | "delivered" | "delayed" | null;
}

export async function migrateShipping(
  payload: { items: ShippingPayload[]; dryRun: boolean }
): Promise<{ ok: boolean; error?: string; result?: EntityMigrationResult }> {
  const guard = await requireTeam();
  if (!guard.ok) return { ok: false, error: guard.error };

  const res = emptyResult("contract_shipping", payload.items.length);
  if (payload.items.length === 0) return { ok: true, result: res };

  const admin = createAdminClient();

  const { data: existing } = await admin.from("contract_shipping").select("contract_id");
  const existingIds = new Set<string>(
    ((existing ?? []) as Array<{ contract_id: string }>).map((r) => r.contract_id)
  );

  const toInsert: ShippingPayload[] = [];
  for (const item of payload.items) {
    if (!item.contractId) {
      res.failedCount++;
      res.errors.push({ id: item.localContractNo, message: "Contract FK not resolved", item });
      continue;
    }
    if (existingIds.has(item.contractId)) { res.skippedExisting++; continue; }
    toInsert.push(item);
  }

  if (payload.dryRun) {
    res.migratedCount += toInsert.length;
    return { ok: true, result: res };
  }

  for (const s of toInsert) {
    try {
      const { error } = await withRetries(async () => admin.from("contract_shipping").insert({
        contract_id: s.contractId,
        etd: s.etd ?? null,
        atd: s.atd ?? null,
        eta: s.eta ?? null,
        ata: s.ata ?? null,
        carrier: s.carrier ?? null,
        vessel: s.vessel ?? null,
        voyage: s.voyage ?? null,
        bl_number: s.blNumber ?? null,
        container_numbers: s.containerNumbers ?? null,
        shipsgo_data: s.shipsgoData ?? null,
        status: s.status ?? null,
      }));
      if (error) throw error;
      res.migratedCount++;
    } catch (err) {
      res.failedCount++;
      res.errors.push({ id: s.localContractNo, message: (err as Error).message, item: s });
    }
    await sleep(BATCH_DELAY_MS);
  }
  return { ok: true, result: res };
}

/* ═════════════════════════ DOCUMENTS (metadata) ═════════════════════════ */

export interface DocumentPayload {
  contractId: string;
  localContractNo?: string;
  docType: "sc" | "ci" | "ci-customs" | "pl" | "co" | "health" | "phyto" | "bl" | "other";
  fileName: string;
  fileSize?: number;
}

export async function migrateDocuments(
  payload: { items: DocumentPayload[]; dryRun: boolean }
): Promise<{ ok: boolean; error?: string; result?: EntityMigrationResult }> {
  const guard = await requireTeam();
  if (!guard.ok) return { ok: false, error: guard.error };

  const res = emptyResult("contract_documents", payload.items.length);
  if (payload.items.length === 0) return { ok: true, result: res };

  const admin = createAdminClient();

  const { data: existing } = await admin.from("contract_documents").select("contract_id, doc_type");
  const existingKeys = new Set<string>();
  for (const row of (existing ?? []) as Array<{ contract_id: string; doc_type: string }>) {
    existingKeys.add(`${row.contract_id}|${row.doc_type}`);
  }

  const toInsert: DocumentPayload[] = [];
  for (const item of payload.items) {
    if (!item.contractId) {
      res.failedCount++;
      res.errors.push({ id: item.localContractNo, message: "Contract FK not resolved", item });
      continue;
    }
    if (!item.fileName) {
      res.failedCount++;
      res.errors.push({ id: item.localContractNo, message: "Missing file_name", item });
      continue;
    }
    const k = `${item.contractId}|${item.docType}`;
    if (existingKeys.has(k)) { res.skippedExisting++; continue; }
    // Also de-dupe within this payload (same contract + doc_type could appear twice in localStorage)
    existingKeys.add(k);
    toInsert.push(item);
  }

  if (payload.dryRun) {
    res.migratedCount += toInsert.length;
    return { ok: true, result: res };
  }

  for (const d of toInsert) {
    try {
      const { error } = await withRetries(async () => admin.from("contract_documents").insert({
        contract_id: d.contractId,
        doc_type: d.docType,
        file_name: d.fileName,
        file_size: d.fileSize ?? null,
        storage_path: null,
      }));
      if (error) throw error;
      res.migratedCount++;
    } catch (err) {
      res.failedCount++;
      res.errors.push({ id: d.localContractNo, message: (err as Error).message, item: d });
    }
    await sleep(BATCH_DELAY_MS);
  }
  return { ok: true, result: res };
}

/* ═════════════════════════ DB SUMMARY ═════════════════════════ */

export interface DbCounts {
  products: number;
  buyers: number;
  sellers: number;
  contracts: number;
  contract_finance: number;
  contract_shipping: number;
  contract_documents: number;
}

export async function getDbCounts(): Promise<{ ok: boolean; error?: string; counts?: DbCounts }> {
  const guard = await requireTeam();
  if (!guard.ok) return { ok: false, error: guard.error };
  const admin = createAdminClient();

  async function count(tbl: string): Promise<number> {
    const { count: c, error } = await admin.from(tbl).select("*", { count: "exact", head: true });
    if (error) throw error;
    return c ?? 0;
  }

  try {
    const counts: DbCounts = {
      products: await count("products"),
      buyers: await count("buyers"),
      sellers: await count("sellers"),
      contracts: await count("contracts"),
      contract_finance: await count("contract_finance"),
      contract_shipping: await count("contract_shipping"),
      contract_documents: await count("contract_documents"),
    };
    return { ok: true, counts };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
