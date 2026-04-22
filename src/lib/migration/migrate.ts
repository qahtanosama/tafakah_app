/**
 * Client-side migration orchestrator.
 *
 * Reads localStorage, resolves FKs via IdMapper, calls per-entity server actions
 * in order, and accumulates results + mappings.
 *
 * Pure data copy — does NOT modify existing localStorage keys.
 */

import type { MigrationRun, EntityMigrationResult, MigrationEntity } from "./types";
import { LAST_RUN_KEY, RUNNING_FLAG_KEY, MIGRATION_ENTITIES } from "./types";
import { IdMapper } from "./id-map";
import {
  readProducts,
  readBuyers,
  readSellers,
  readContracts,
  readContractFinance,
  readContractShipping,
  readContractDocumentRefs,
} from "./localstorage-reader";
import {
  migrateProducts,
  migrateBuyers,
  migrateSellers,
  migrateContracts,
  migrateFinance,
  migrateShipping,
  migrateDocuments,
  type BuyerPayload,
  type ContractPayload,
  type DocumentPayload,
  type FinancePayload,
  type ProductPayload,
  type SellerPayload,
  type ShippingPayload,
} from "@/app/admin/migrate/actions";

export interface MigrationProgressEvent {
  entity: MigrationEntity;
  status: "started" | "finished";
  result?: EntityMigrationResult;
}

export interface RunOptions {
  dryRun: boolean;
  onProgress?: (e: MigrationProgressEvent) => void;
}

export function loadLastRun(): MigrationRun | null {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MigrationRun;
  } catch {
    return null;
  }
}

export function persistLastRun(run: MigrationRun): void {
  try { localStorage.setItem(LAST_RUN_KEY, JSON.stringify(run)); } catch { /* ignore */ }
}

export function isMigrationRunning(): boolean {
  try {
    const raw = localStorage.getItem(RUNNING_FLAG_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    // 10-minute staleness window
    return Date.now() - ts < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

function setRunningFlag() {
  try { localStorage.setItem(RUNNING_FLAG_KEY, String(Date.now())); } catch { /* ignore */ }
}

function clearRunningFlag() {
  try { localStorage.removeItem(RUNNING_FLAG_KEY); } catch { /* ignore */ }
}

/* ────────────────────── Local counts ────────────────────── */

export interface LocalCounts {
  products: number;
  buyers: number;
  sellers: number;
  contracts: number;
  contract_finance: number;
  contract_shipping: number;
  contract_documents: number;
}

export async function getLocalCounts(): Promise<LocalCounts> {
  const docRefs = await readContractDocumentRefs();
  return {
    products: readProducts().length,
    buyers: readBuyers().length,
    sellers: readSellers().length,
    contracts: readContracts().length,
    contract_finance: readContractFinance().length,
    contract_shipping: readContractShipping().length,
    contract_documents: docRefs.length,
  };
}

/* ────────────────────── Shape transforms ────────────────────── */

function toProductPayload(p: { id: string; name: string; hsCode: string; prefix: string }): ProductPayload {
  return {
    localId: p.id,
    name: p.name,
    prefix: p.prefix,
    hsCode: p.hsCode,
  };
}

function toBuyerPayload(b: import("@/types/buyer").Buyer): BuyerPayload {
  return {
    localId: b.id,
    companyName: b.company,
    contactName: (b.contactPerson?.trim() || b.shortName?.trim() || b.company),
    whatsappNumber: b.whatsappNumber ?? null,
    phoneNumber: b.phone ?? null,
    email: b.email ?? null,
    preferredLanguage: (b.preferredLanguage as "en" | "ar" | "zh" | undefined) ?? null,
    country: b.country ?? null,
    city: b.cityPostal ?? null,
    address: b.address ?? null,
    defaultDocPreset: (b.defaultDocPreset as BuyerPayload["defaultDocPreset"]) ?? null,
    customMessageTemplate: (b.customMessageTemplate as Record<string, unknown> | undefined) ?? null,
    notes: b.notes ?? null,
  };
}

function toSellerPayload(s: import("@/types/seller").Seller, idMap: IdMapper): SellerPayload {
  const productUuids: string[] = [];
  for (const pid of s.products ?? []) {
    const uuid = idMap.resolve("products", pid);
    if (uuid) productUuids.push(uuid);
  }
  return {
    localId: s.id,
    companyName: s.companyName,
    companyNameCn: s.companyNameCn ?? null,
    contactName: s.contactName,
    contactTitle: s.contactTitle ?? null,
    whatsappNumber: s.whatsappNumber ?? null,
    phoneNumber: s.phoneNumber ?? null,
    email: s.email ?? null,
    preferredLanguage: (s.preferredLanguage as "en" | "ar" | "zh" | undefined) ?? null,
    country: s.country,
    city: s.city ?? null,
    address: s.address ?? null,
    products: productUuids,
    paymentTerms: s.paymentTerms ?? null,
    leadTimeDays: s.leadTimeDays ?? null,
    bankDetails: (s.bankDetails as Record<string, unknown> | undefined) ?? null,
    customMessageTemplate: (s.customMessageTemplate as Record<string, unknown> | undefined) ?? null,
    defaultDocPreset: (s.defaultDocPreset as SellerPayload["defaultDocPreset"]) ?? null,
    notes: s.notes ?? null,
  };
}

function buyerIdFor(contract: { buyer?: string; masterSnapshot?: { buyer?: { company?: string } } }, buyers: Array<{ id: string; company: string }>, idMap: IdMapper): string | null {
  const name = (contract.buyer ?? contract.masterSnapshot?.buyer?.company ?? "").trim().toLowerCase();
  if (!name) return null;
  const local = buyers.find((b) => (b.company ?? "").trim().toLowerCase() === name);
  if (!local) return null;
  return idMap.resolve("buyers", local.id) ?? null;
}

function toContractPayload(entry: {
  id: string;
  contractNo: string;
  invoiceNo: string;
  dateSubmitted: string;
  masterSnapshot: {
    identifiers?: { contractDate?: string };
    lineItems?: unknown;
    terms?: unknown;
    buyer?: { company?: string };
    sellerId?: string;
    workflow?: { currentStage?: string; history?: unknown };
  };
  sellerId?: string;
  workflow?: { currentStage?: string; history?: unknown };
  buyer: string;
}, buyers: Array<{ id: string; company: string }>, idMap: IdMapper): ContractPayload {
  const buyerUuid = buyerIdFor(entry, buyers, idMap);
  const sellerLocalId = entry.sellerId ?? entry.masterSnapshot?.sellerId;
  const sellerUuid = sellerLocalId ? (idMap.resolve("sellers", sellerLocalId) ?? null) : null;

  const stage = entry.workflow?.currentStage ?? entry.masterSnapshot?.workflow?.currentStage ?? "docs-generated";
  const history = entry.workflow?.history ?? entry.masterSnapshot?.workflow?.history ?? {};

  return {
    localId: entry.contractNo,
    contractNo: entry.contractNo,
    invoiceNo: entry.invoiceNo || entry.contractNo,
    buyerId: buyerUuid,
    sellerId: sellerUuid,
    contractDate: entry.masterSnapshot?.identifiers?.contractDate ?? null,
    lineItems: entry.masterSnapshot?.lineItems ?? [],
    terms: entry.masterSnapshot?.terms ?? null,
    totals: null,
    currentStage: stage,
    workflowHistory: history,
  };
}

function toFinancePayload(entry: { contractNo: string; costs: unknown; payments: unknown }, idMap: IdMapper): FinancePayload | null {
  const contractUuid = idMap.resolve("contracts", entry.contractNo);
  if (!contractUuid) return null;
  return {
    contractId: contractUuid,
    localContractNo: entry.contractNo,
    costItems: entry.costs ?? [],
    paymentsReceived: entry.payments ?? [],
  };
}

function mapShippingStatus(override: string | undefined): ShippingPayload["status"] {
  switch (override) {
    case "pending": return "pending";
    case "at_sea": return "in-transit";
    case "delivered": return "delivered";
    case "delayed": return "delayed";
    default: return null;
  }
}

function toShippingPayload(entry: {
  contractNo: string;
  shippingLine?: string;
  vesselName?: string;
  voyageNumber?: string;
  blNumber?: string;
  containerNumber?: string;
  etd?: string;
  atd?: string | null;
  eta?: string;
  ata?: string | null;
  statusOverride?: string;
  shipsgoRequestId?: string | null;
  lastAutoFetchAt?: string | null;
}, idMap: IdMapper): ShippingPayload | null {
  const contractUuid = idMap.resolve("contracts", entry.contractNo);
  if (!contractUuid) return null;
  const containerNumbers = entry.containerNumber ? [entry.containerNumber] : null;
  const shipsgoData = entry.shipsgoRequestId || entry.lastAutoFetchAt
    ? { requestId: entry.shipsgoRequestId, lastAutoFetchAt: entry.lastAutoFetchAt }
    : null;
  return {
    contractId: contractUuid,
    localContractNo: entry.contractNo,
    etd: entry.etd || null,
    atd: entry.atd || null,
    eta: entry.eta || null,
    ata: entry.ata || null,
    carrier: entry.shippingLine || null,
    vessel: entry.vesselName || null,
    voyage: entry.voyageNumber || null,
    blNumber: entry.blNumber || null,
    containerNumbers,
    shipsgoData,
    status: mapShippingStatus(entry.statusOverride),
  };
}

function toDocumentPayload(ref: {
  contractNo: string;
  docType: DocumentPayload["docType"];
  fileName: string;
  fileSize: number;
}, idMap: IdMapper): DocumentPayload | null {
  const contractUuid = idMap.resolve("contracts", ref.contractNo);
  if (!contractUuid) return null;
  return {
    contractId: contractUuid,
    localContractNo: ref.contractNo,
    docType: ref.docType,
    fileName: ref.fileName,
    fileSize: ref.fileSize,
  };
}

/* ────────────────────── Main runner ────────────────────── */

export async function runMigration(options: RunOptions): Promise<MigrationRun> {
  const idMap = IdMapper.load();
  const run: MigrationRun = {
    startedAt: new Date().toISOString(),
    status: "running",
    results: [],
    dryRun: options.dryRun,
  };
  setRunningFlag();

  function emit(entity: MigrationEntity, status: "started" | "finished", result?: EntityMigrationResult) {
    options.onProgress?.({ entity, status, result });
  }
  function record(result: EntityMigrationResult) {
    run.results.push(result);
    emit(result.entity, "finished", result);
  }

  try {
    // ── products ──
    emit("products", "started");
    const products = readProducts();
    const pPayload = products.map(toProductPayload);
    const pResp = await migrateProducts({ items: pPayload, dryRun: options.dryRun });
    if (!pResp.ok || !pResp.result) throw new Error(pResp.error ?? "products migration failed");
    if (pResp.mappings) idMap.registerMany("products", pResp.mappings);
    idMap.persist();
    record(pResp.result);

    // ── buyers ──
    emit("buyers", "started");
    const buyers = readBuyers();
    const bPayload = buyers.map(toBuyerPayload);
    const bResp = await migrateBuyers({ items: bPayload, dryRun: options.dryRun });
    if (!bResp.ok || !bResp.result) throw new Error(bResp.error ?? "buyers migration failed");
    if (bResp.mappings) idMap.registerMany("buyers", bResp.mappings);
    idMap.persist();
    record(bResp.result);

    // ── sellers ──
    emit("sellers", "started");
    const sellers = readSellers();
    const sPayload = sellers.map((s) => toSellerPayload(s, idMap));
    const sResp = await migrateSellers({ items: sPayload, dryRun: options.dryRun });
    if (!sResp.ok || !sResp.result) throw new Error(sResp.error ?? "sellers migration failed");
    if (sResp.mappings) idMap.registerMany("sellers", sResp.mappings);
    idMap.persist();
    record(sResp.result);

    // ── contracts ──
    emit("contracts", "started");
    const contracts = readContracts();
    const cPayload = contracts.map((c) => toContractPayload(c, buyers, idMap));
    const cResp = await migrateContracts({ items: cPayload, dryRun: options.dryRun });
    if (!cResp.ok || !cResp.result) throw new Error(cResp.error ?? "contracts migration failed");
    if (cResp.mappings) idMap.registerMany("contracts", cResp.mappings);
    idMap.persist();
    record(cResp.result);

    // ── finance ──
    emit("contract_finance", "started");
    const financeEntries = readContractFinance();
    const fPayloads: FinancePayload[] = [];
    for (const f of financeEntries) {
      const payload = toFinancePayload(f, idMap);
      if (payload) fPayloads.push(payload);
    }
    const fResp = await migrateFinance({ items: fPayloads, dryRun: options.dryRun });
    if (!fResp.ok || !fResp.result) throw new Error(fResp.error ?? "finance migration failed");
    // Account for finance entries whose contract FK couldn't be resolved
    if (financeEntries.length > fPayloads.length) {
      fResp.result.failedCount += financeEntries.length - fPayloads.length;
      fResp.result.errors.push({ message: `${financeEntries.length - fPayloads.length} finance entry/entries had no resolvable contract_id` });
    }
    fResp.result.localCount = financeEntries.length;
    record(fResp.result);

    // ── shipping ──
    emit("contract_shipping", "started");
    const shipping = readContractShipping();
    const shPayloads: ShippingPayload[] = [];
    for (const sh of shipping) {
      const payload = toShippingPayload(sh, idMap);
      if (payload) shPayloads.push(payload);
    }
    const shResp = await migrateShipping({ items: shPayloads, dryRun: options.dryRun });
    if (!shResp.ok || !shResp.result) throw new Error(shResp.error ?? "shipping migration failed");
    if (shipping.length > shPayloads.length) {
      shResp.result.failedCount += shipping.length - shPayloads.length;
      shResp.result.errors.push({ message: `${shipping.length - shPayloads.length} shipping entry/entries had no resolvable contract_id` });
    }
    shResp.result.localCount = shipping.length;
    record(shResp.result);

    // ── documents ──
    emit("contract_documents", "started");
    const docRefs = await readContractDocumentRefs();
    const dPayloads: DocumentPayload[] = [];
    for (const d of docRefs) {
      const payload = toDocumentPayload(d, idMap);
      if (payload) dPayloads.push(payload);
    }
    const dResp = await migrateDocuments({ items: dPayloads, dryRun: options.dryRun });
    if (!dResp.ok || !dResp.result) throw new Error(dResp.error ?? "documents migration failed");
    if (docRefs.length > dPayloads.length) {
      dResp.result.failedCount += docRefs.length - dPayloads.length;
      dResp.result.errors.push({ message: `${docRefs.length - dPayloads.length} document(s) had no resolvable contract_id` });
    }
    dResp.result.localCount = docRefs.length;
    record(dResp.result);

    // Overall status
    const anyFailed = run.results.some((r) => r.failedCount > 0);
    const anyMigrated = run.results.some((r) => r.migratedCount > 0);
    run.status = anyFailed
      ? (anyMigrated ? "partial" : "failed")
      : "success";
    run.finishedAt = new Date().toISOString();

    if (!options.dryRun) persistLastRun(run);
    idMap.persist();
    return run;
  } catch (err) {
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    run.results.push({
      entity: "products",
      localCount: 0,
      migratedCount: 0,
      failedCount: 0,
      skippedExisting: 0,
      errors: [{ message: `Fatal: ${(err as Error).message}` }],
    });
    if (!options.dryRun) persistLastRun(run);
    return run;
  } finally {
    clearRunningFlag();
  }
}

export { MIGRATION_ENTITIES };
