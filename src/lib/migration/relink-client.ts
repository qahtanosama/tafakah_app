/**
 * Re-links localStorage records to their existing Supabase rows.
 *
 * Many buyers/sellers/products in localStorage have legacy IDs (e.g. "buyer-1745...")
 * that don't match the UUIDs of the same rows in Supabase. This module walks each
 * local list, looks up the matching DB row by natural key (company+country for
 * buyers/sellers, prefix for products), and writes the Supabase UUID back to the
 * local record. It also registers the mapping in IdMapper so existing FK
 * resolution continues to work.
 *
 * Idempotent: rows whose id is already a UUID are left alone.
 */

import { IdMapper } from "./id-map";
import {
  getBuyersForRelink,
  getSellersForRelink,
  getProductsForRelink,
} from "@/app/(team)/admin/migrate/actions";
import type { Buyer } from "@/types/buyer";
import type { Seller } from "@/types/seller";
import type { ProductProfile } from "@/types/product";

export type RelinkEntity = "buyers" | "sellers" | "products";

export interface RelinkResult {
  entity: RelinkEntity;
  totalLocal: number;
  alreadyLinked: number;
  relinked: number;
  notFoundInDb: number;
  errors: { localId: string; reason: string }[];
}

export interface AuditEntityReport {
  entity: RelinkEntity;
  total: number;
  withUuid: number;
  withLegacyId: number;
}

export interface AuditReport {
  buyers: AuditEntityReport;
  sellers: AuditEntityReport;
  products: AuditEntityReport;
  ok: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string | undefined | null): boolean {
  return !!s && UUID_RE.test(s);
}

function emptyResult(entity: RelinkEntity, total: number): RelinkResult {
  return { entity, totalLocal: total, alreadyLinked: 0, relinked: 0, notFoundInDb: 0, errors: [] };
}

function normKey(name: string | undefined | null, country: string | undefined | null): string {
  return `${(name ?? "").trim().toLowerCase()}|${(country ?? "").trim().toLowerCase()}`;
}

function safeReadArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/* ────────────── Buyers ────────────── */

export async function relinkBuyersInLocalStorage(): Promise<RelinkResult> {
  const local = safeReadArray<Buyer>("buyers-database");
  const result = emptyResult("buyers", local.length);
  if (local.length === 0) return result;

  const resp = await getBuyersForRelink();
  if (!resp.ok) {
    result.errors.push({ localId: "(server)", reason: resp.error });
    return result;
  }

  const lookup = new Map<string, string>();
  for (const row of resp.rows) {
    const key = normKey(row.company_name, row.country);
    if (!lookup.has(key)) lookup.set(key, row.id);
    else result.errors.push({ localId: "(db)", reason: `Duplicate DB rows for "${row.company_name}" (${row.country ?? "no country"})` });
  }

  const idMap = IdMapper.load();
  let mutated = false;

  const updated = local.map((b) => {
    if (isUuid(b.id)) {
      result.alreadyLinked++;
      idMap.register("buyers", b.id, b.id);
      return b;
    }
    const key = normKey(b.company, b.country);
    const dbId = lookup.get(key);
    if (!dbId) {
      result.notFoundInDb++;
      result.errors.push({
        localId: b.id ?? "(unknown)",
        reason: `No DB match for "${b.company}" in ${b.country || "(no country)"}`,
      });
      return b;
    }
    idMap.register("buyers", b.id, dbId);
    idMap.register("buyers", dbId, dbId);
    result.relinked++;
    mutated = true;
    return { ...b, id: dbId };
  });

  if (mutated) {
    localStorage.setItem("buyers-database", JSON.stringify(updated));
  }
  idMap.persist();
  return result;
}

/* ────────────── Sellers ────────────── */

export async function relinkSellersInLocalStorage(): Promise<RelinkResult> {
  const local = safeReadArray<Seller>("sellers-database");
  const result = emptyResult("sellers", local.length);
  if (local.length === 0) return result;

  const resp = await getSellersForRelink();
  if (!resp.ok) {
    result.errors.push({ localId: "(server)", reason: resp.error });
    return result;
  }

  const lookup = new Map<string, string>();
  for (const row of resp.rows) {
    const key = normKey(row.company_name, row.country);
    if (!lookup.has(key)) lookup.set(key, row.id);
    else result.errors.push({ localId: "(db)", reason: `Duplicate DB rows for "${row.company_name}" (${row.country ?? "no country"})` });
  }

  const idMap = IdMapper.load();
  let mutated = false;

  const updated = local.map((s) => {
    if (isUuid(s.id)) {
      result.alreadyLinked++;
      idMap.register("sellers", s.id, s.id);
      return s;
    }
    const key = normKey(s.companyName, s.country);
    const dbId = lookup.get(key);
    if (!dbId) {
      result.notFoundInDb++;
      result.errors.push({
        localId: s.id ?? "(unknown)",
        reason: `No DB match for "${s.companyName}" in ${s.country || "(no country)"}`,
      });
      return s;
    }
    idMap.register("sellers", s.id, dbId);
    idMap.register("sellers", dbId, dbId);
    result.relinked++;
    mutated = true;
    return { ...s, id: dbId };
  });

  if (mutated) {
    localStorage.setItem("sellers-database", JSON.stringify(updated));
  }
  idMap.persist();
  return result;
}

/* ────────────── Products ────────────── */

export async function relinkProductsInLocalStorage(): Promise<RelinkResult> {
  const local = safeReadArray<ProductProfile>("products-database");
  const result = emptyResult("products", local.length);
  if (local.length === 0) return result;

  const resp = await getProductsForRelink();
  if (!resp.ok) {
    result.errors.push({ localId: "(server)", reason: resp.error });
    return result;
  }

  const byPrefix = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const row of resp.rows) {
    const pk = (row.prefix ?? "").trim().toLowerCase();
    const nk = (row.name ?? "").trim().toLowerCase();
    if (pk && !byPrefix.has(pk)) byPrefix.set(pk, row.id);
    if (nk && !byName.has(nk)) byName.set(nk, row.id);
  }

  const idMap = IdMapper.load();
  let mutated = false;

  const updated = local.map((p) => {
    if (isUuid(p.id)) {
      result.alreadyLinked++;
      idMap.register("products", p.id, p.id);
      return p;
    }
    const pk = (p.prefix ?? "").trim().toLowerCase();
    const nk = (p.name ?? "").trim().toLowerCase();
    const dbId = byPrefix.get(pk) ?? byName.get(nk);
    if (!dbId) {
      result.notFoundInDb++;
      result.errors.push({
        localId: p.id ?? "(unknown)",
        reason: `No DB match for prefix "${p.prefix}" / name "${p.name}"`,
      });
      return p;
    }
    idMap.register("products", p.id, dbId);
    idMap.register("products", dbId, dbId);
    result.relinked++;
    mutated = true;
    return { ...p, id: dbId };
  });

  if (mutated) {
    localStorage.setItem("products-database", JSON.stringify(updated));
  }
  idMap.persist();
  return result;
}

/* ────────────── Run all ────────────── */

export async function relinkAllInLocalStorage(): Promise<{
  buyers: RelinkResult;
  sellers: RelinkResult;
  products: RelinkResult;
}> {
  // Run in dependency order: products first (sellers reference product ids), then buyers, then sellers.
  const products = await relinkProductsInLocalStorage();
  const buyers = await relinkBuyersInLocalStorage();
  const sellers = await relinkSellersInLocalStorage();
  return { products, buyers, sellers };
}

/* ────────────── Audit (read-only) ────────────── */

export function auditLocalLinkage(): AuditReport {
  const buyers = safeReadArray<Buyer>("buyers-database");
  const sellers = safeReadArray<Seller>("sellers-database");
  const products = safeReadArray<ProductProfile>("products-database");

  function audit(entity: RelinkEntity, list: { id: string }[]): AuditEntityReport {
    let withUuid = 0;
    let withLegacy = 0;
    for (const r of list) {
      if (isUuid(r.id)) withUuid++;
      else withLegacy++;
    }
    return { entity, total: list.length, withUuid, withLegacyId: withLegacy };
  }

  const buyersReport = audit("buyers", buyers);
  const sellersReport = audit("sellers", sellers);
  const productsReport = audit("products", products);

  return {
    buyers: buyersReport,
    sellers: sellersReport,
    products: productsReport,
    ok:
      buyersReport.withLegacyId === 0 &&
      sellersReport.withLegacyId === 0 &&
      productsReport.withLegacyId === 0,
  };
}
