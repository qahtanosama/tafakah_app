"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MarketPack, ProductProfile } from "@/types/product";
import { createClient } from "@/lib/supabase/client";
import { withRetryQueue } from "@/lib/db/helpers";
import { type PackPatch, mergePack } from "@/lib/quote/pack";

interface DbProduct {
  id: string;
  name: string;
  name_ar: string | null;
  name_zh: string | null;
  prefix: string;
  hs_code: string;
  default_nw: number;
  default_gw: number;
  default_cartons: number | null;
  pack_unit: string | null;
  pack_unit_ar: string | null;
  default_price_mt: number;
  origin: string | null;
  container_type: string;
  notes: string;
  market_packs: Record<string, MarketPack> | null;
  created_at: string;
  updated_at: string;
}

function dbToLocal(row: DbProduct): ProductProfile {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar ?? "",
    hsCode: row.hs_code,
    prefix: row.prefix,
    defaultNW: Number(row.default_nw ?? 0),
    defaultGW: Number(row.default_gw ?? 0),
    defaultCartons: Number(row.default_cartons ?? 0),
    packUnit: row.pack_unit || "carton",
    packUnitAr: row.pack_unit_ar || "كرتون",
    defaultPriceMT: Number(row.default_price_mt ?? 0),
    origin: row.origin ?? "",
    containerType: row.container_type ?? "",
    notes: row.notes ?? "",
    marketPacks: row.market_packs ?? {},
  };
}

function localToDb(p: ProductProfile): Omit<DbProduct, "created_at" | "updated_at"> {
  return {
    id: p.id,
    name: p.name,
    name_ar: p.nameAr.trim() || null,
    name_zh: null,
    prefix: p.prefix,
    hs_code: p.hsCode,
    default_nw: p.defaultNW,
    default_gw: p.defaultGW,
    default_cartons: p.defaultCartons,
    pack_unit: p.packUnit || "carton",
    pack_unit_ar: p.packUnitAr || "كرتون",
    default_price_mt: p.defaultPriceMT,
    origin: p.origin ?? "",
    container_type: p.containerType,
    notes: p.notes,
    market_packs: p.marketPacks ?? {},
  };
}

export function useProducts() {
  useRealtimeProducts();
  return useQuery<ProductProfile[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return (data as unknown as DbProduct[]).map(dbToLocal);
    },
  });
}

function useRealtimeProducts() {
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    // Unique channel name per mount — see note in data/buyers.ts (Strict Mode).
    const channelName = `public:products:${Math.random().toString(36).slice(2, 9)}`;
    const ch = supabase.channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        qc.invalidateQueries({ queryKey: ["products"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);
}

export function useSaveProduct() {
  const qc = useQueryClient();
  const key = ["products"] as const;

  return useMutation({
    mutationFn: async ({ payload: product, isUpdate }: { payload: ProductProfile; isUpdate: boolean }) => {
      const supabase = createClient();
      const row = localToDb(product);
      const result = await withRetryQueue(async () => {
        if (isUpdate) {
          const { data, error } = await supabase
            .from("products")
            .update({
              name: row.name,
              name_ar: row.name_ar,
              prefix: row.prefix,
              hs_code: row.hs_code,
              default_nw: row.default_nw,
              default_gw: row.default_gw,
              default_cartons: row.default_cartons,
              pack_unit: row.pack_unit,
              pack_unit_ar: row.pack_unit_ar,
              default_price_mt: row.default_price_mt,
              origin: row.origin,
              container_type: row.container_type,
              notes: row.notes,
              market_packs: row.market_packs,
            })
            .eq("id", product.id)
            .select()
            .single();
          if (error) throw error;
          return dbToLocal(data as unknown as DbProduct);
        }
        const insertRow = { ...row } as Partial<DbProduct>;
        if (!insertRow.id) delete insertRow.id;
        const { data, error } = await supabase.from("products").insert(insertRow as never).select().single();
        if (error) throw error;
        return dbToLocal(data as unknown as DbProduct);
      }, {
        entity: "products",
        operation: isUpdate ? "update" : "insert",
        payload: isUpdate ? { ...row } : (() => { const r = { ...row } as Partial<DbProduct>; delete r.id; return r; })(),
        idempotencyKey: `product-${product.id || crypto.randomUUID()}`,
        originPath: "/products",
      });
      return result === "queued" ? product : result;
    },
    onMutate: async ({ payload: product }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ProductProfile[]>([...key]);
      qc.setQueryData<ProductProfile[]>([...key], (old) => {
        if (!old) return [product];
        const idx = old.findIndex((p) => p.id === product.id);
        if (idx >= 0) { const next = [...old]; next[idx] = product; return next; }
        return [...old, product];
      });
      return { previous };
    },
    onError: (_err, _product, ctx) => {
      if (ctx?.previous) qc.setQueryData([...key], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/**
 * Writes ONLY a product's pack figures, for the calculator's write-back.
 *
 * Deliberately not useSaveProduct: that names every column, so a client holding
 * a partial product — a query cache from before a column existed, a row fetched
 * by an older bundle — silently blanks the fields it does not know about. A
 * background write triggered by typing must not be able to do that. This
 * touches the three measured columns, or the one market_packs key, and nothing
 * else; a product's name, HS code and origin are untouchable from here.
 *
 * For a non-default market it re-reads that row's market_packs immediately
 * before writing and merges into what the DATABASE holds, not into what this
 * tab happens to have cached — so `packUnit` and `transitTaxPerMT`, which the
 * calculator has no control for, survive a stale client.
 */
export interface SavePackInput {
  productId: string;
  market: string;
  /** True when this market's pack IS the product's own columns. */
  isDefaultMarket: boolean;
  patch: PackPatch;
}

export function useSavePack() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, market, isDefaultMarket, patch }: SavePackInput) => {
      const supabase = createClient();

      if (isDefaultMarket) {
        const columns: Record<string, number> = {};
        if (patch.cartons !== undefined && patch.cartons > 0) columns.default_cartons = patch.cartons;
        if (patch.nw !== undefined && patch.nw > 0) columns.default_nw = patch.nw;
        if (patch.gw !== undefined && patch.gw > 0) columns.default_gw = patch.gw;
        if (Object.keys(columns).length === 0) return null;
        const { error } = await supabase.from("products").update(columns).eq("id", productId);
        if (error) throw error;
        return null;
      }

      const { data: row, error: readErr } = await supabase
        .from("products")
        .select("market_packs")
        .eq("id", productId)
        .single();
      if (readErr) throw readErr;

      const packs = ((row as { market_packs: Record<string, MarketPack> | null })?.market_packs ??
        {}) as Record<string, MarketPack>;
      const merged = mergePack(packs[market] ?? {}, patch);
      if (merged === null) return null;

      const { error } = await supabase
        .from("products")
        .update({ market_packs: { ...packs, [market]: merged } })
        .eq("id", productId);
      if (error) throw error;
      return null;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  const key = ["products"] as const;

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      await withRetryQueue(async () => {
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) throw error;
        return id;
      }, {
        entity: "products",
        operation: "delete",
        payload: { id },
        idempotencyKey: `product-del-${id}`,
        originPath: "/products",
      });
      return id;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ProductProfile[]>([...key]);
      qc.setQueryData<ProductProfile[]>([...key], (old) => (old ?? []).filter((p) => p.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData([...key], ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/**
 * Kept for API compatibility. Bulk persistence is now handled per-row by the
 * individual save/delete hooks against Supabase, so this is a no-op.
 */
export function useSaveAllProducts() {
  return useMutation({
    mutationFn: async (_all: ProductProfile[]) => {
      // no-op — individual save/delete hooks handle DB writes
    },
  });
}
