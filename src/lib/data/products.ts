"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProductProfile } from "@/types/product";
import { createClient } from "@/lib/supabase/client";
import { useFeatureFlag } from "@/lib/feature-flags";
import { withRetryQueue } from "@/lib/db/helpers";
import {
  getProducts as readLocal,
  saveProducts as writeLocal,
  addProduct as addLocal,
  updateProduct as updateLocal,
  deleteProduct as deleteLocal,
} from "@/lib/products";

interface DbProduct {
  id: string;
  name: string;
  name_ar: string | null;
  name_zh: string | null;
  prefix: string;
  hs_code: string;
  created_at: string;
  updated_at: string;
}

function dbToLocal(row: DbProduct): ProductProfile {
  // Existing app-side ProductProfile carries extra fields (defaultNW, defaultGW, defaultPriceMT, containerType, notes)
  // that don't exist in the DB schema. Fill with sensible defaults so the UI doesn't crash.
  return {
    id: row.id,
    name: row.name,
    hsCode: row.hs_code,
    prefix: row.prefix,
    defaultNW: 0,
    defaultGW: 0,
    defaultPriceMT: 0,
    containerType: "",
    notes: "",
  };
}

function localToDb(p: ProductProfile): Omit<DbProduct, "created_at" | "updated_at"> {
  return {
    id: p.id,
    name: p.name,
    name_ar: null,
    name_zh: null,
    prefix: p.prefix,
    hs_code: p.hsCode,
  };
}

export function useProducts() {
  const [useDb] = useFeatureFlag("products-db");
  useRealtimeProducts(useDb);
  return useQuery<ProductProfile[]>({
    queryKey: ["products", useDb ? "db" : "local"],
    queryFn: async () => {
      if (!useDb) return readLocal();
      const supabase = createClient();
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return (data as unknown as DbProduct[]).map(dbToLocal);
    },
  });
}

function useRealtimeProducts(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    const ch = supabase.channel("public:products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        qc.invalidateQueries({ queryKey: ["products"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [enabled, qc]);
}

export function useSaveProduct() {
  const [useDb] = useFeatureFlag("products-db");
  const qc = useQueryClient();
  const key = ["products", useDb ? "db" : "local"] as const;

  return useMutation({
    mutationFn: async (product: ProductProfile) => {
      if (!useDb) {
        // Preserve the existing localStorage API (update or insert)
        const existing = readLocal().some((p) => p.id === product.id);
        if (existing) updateLocal(product);
        else addLocal(product);
        return product;
      }
      const supabase = createClient();
      const row = localToDb(product);
      const existing = readLocal().some((p) => p.id === product.id);
      const isUpdate = !!product.id && existing;
      const result = await withRetryQueue(async () => {
        if (isUpdate) {
          const { data, error } = await supabase
            .from("products")
            .update({ name: row.name, prefix: row.prefix, hs_code: row.hs_code })
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
    onMutate: async (product) => {
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

export function useDeleteProduct() {
  const [useDb] = useFeatureFlag("products-db");
  const qc = useQueryClient();
  const key = ["products", useDb ? "db" : "local"] as const;

  return useMutation({
    mutationFn: async (id: string) => {
      if (!useDb) { deleteLocal(id); return id; }
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

export function useSaveAllProducts() {
  const [useDb] = useFeatureFlag("products-db");
  return useMutation({
    mutationFn: async (all: ProductProfile[]) => {
      if (!useDb) writeLocal(all);
      // When DB-backed we do nothing here — the individual save/delete hooks handle it
    },
  });
}
