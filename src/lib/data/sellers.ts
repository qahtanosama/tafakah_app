"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Seller, SellerLanguage, SellerDocPreset, SellerBankDetails, SellerMessageTemplate } from "@/types/seller";
import type { ProductProfile } from "@/types/product";
import { createClient } from "@/lib/supabase/client";
import { withRetryQueue } from "@/lib/db/helpers";

interface DbSeller {
  id: string;
  company_name: string;
  company_name_cn: string | null;
  contact_name: string;
  contact_title: string | null;
  whatsapp_number: string | null;
  phone_number: string | null;
  email: string | null;
  preferred_language: string | null;
  country: string;
  city: string | null;
  address: string | null;
  products: string[];
  payment_terms: string | null;
  lead_time_days: number | null;
  bank_details: Record<string, unknown> | null;
  custom_message_template: Record<string, unknown> | null;
  default_doc_preset: string | null;
  notes: string | null;
  wechat_id: string | null;
  created_at: string;
  updated_at: string;
}

function dbToLocal(row: DbSeller): Seller {
  return {
    id: row.id,
    companyName: row.company_name,
    companyNameCn: row.company_name_cn ?? "",
    contactName: row.contact_name,
    contactTitle: row.contact_title ?? "",
    whatsappNumber: row.whatsapp_number ?? "",
    wechatId: row.wechat_id ?? "",
    phoneNumber: row.phone_number ?? "",
    email: row.email ?? "",
    preferredLanguage: (row.preferred_language as SellerLanguage | null) ?? "en",
    country: row.country,
    city: row.city ?? "",
    address: row.address ?? "",
    products: Array.isArray(row.products) ? row.products : [],
    paymentTerms: row.payment_terms ?? "",
    leadTimeDays: row.lead_time_days ?? undefined,
    bankDetails: (row.bank_details as SellerBankDetails | null) ?? {},
    customMessageTemplate: (row.custom_message_template as SellerMessageTemplate | null) ?? {},
    defaultDocPreset: (row.default_doc_preset as SellerDocPreset | null) ?? "factory",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function localToDb(s: Seller) {
  return {
    id: s.id,
    company_name: s.companyName,
    company_name_cn: s.companyNameCn || null,
    contact_name: s.contactName,
    contact_title: s.contactTitle || null,
    whatsapp_number: s.whatsappNumber || null,
    phone_number: s.phoneNumber || null,
    email: s.email || null,
    preferred_language: s.preferredLanguage ?? null,
    country: s.country,
    city: s.city || null,
    address: s.address || null,
    products: s.products ?? [],
    payment_terms: s.paymentTerms || null,
    lead_time_days: s.leadTimeDays ?? null,
    bank_details: (s.bankDetails as unknown as Record<string, unknown>) ?? null,
    custom_message_template: (s.customMessageTemplate as unknown as Record<string, unknown>) ?? null,
    default_doc_preset: s.defaultDocPreset ?? null,
    notes: s.notes || null,
    wechat_id: s.wechatId || null,
  };
}

export function useSellers() {
  useRealtimeSellers();
  return useQuery<Seller[]>({
    queryKey: ["sellers"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("sellers").select("*").order("company_name");
      if (error) throw error;
      return (data as unknown as DbSeller[]).map(dbToLocal);
    },
  });
}

function useRealtimeSellers() {
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel("public:sellers")
      .on("postgres_changes", { event: "*", schema: "public", table: "sellers" }, () => {
        qc.invalidateQueries({ queryKey: ["sellers"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);
}

export function useSaveSeller() {
  const qc = useQueryClient();
  const key = ["sellers"] as const;

  return useMutation({
    mutationFn: async ({ payload: seller, isUpdate }: { payload: Seller; isUpdate: boolean }) => {
      const supabase = createClient();
      const row = localToDb(seller);
      const result = await withRetryQueue(async () => {
        if (isUpdate) {
          const { id: _, ...rest } = row;
          const { data, error } = await supabase.from("sellers").update(rest as never).eq("id", seller.id).select().single();
          if (error) throw error;
          return dbToLocal(data as unknown as DbSeller);
        }
        const { id: _, ...rest } = row;
        const { data, error } = await supabase.from("sellers").insert(rest as never).select().single();
        if (error) throw error;
        return dbToLocal(data as unknown as DbSeller);
      }, {
        entity: "sellers",
        operation: isUpdate ? "update" : "insert",
        payload: { ...row, id: isUpdate ? seller.id : undefined },
        idempotencyKey: `seller-${seller.id || crypto.randomUUID()}`,
        originPath: "/sellers",
      });
      return result === "queued" ? seller : result;
    },
    onMutate: async ({ payload: seller }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Seller[]>([...key]);
      qc.setQueryData<Seller[]>([...key], (old) => {
        if (!old) return [seller];
        const idx = old.findIndex((s) => s.id === seller.id);
        if (idx >= 0) { const next = [...old]; next[idx] = seller; return next; }
        return [...old, seller];
      });
      return { previous };
    },
    onError: (_err, _seller, ctx) => { if (ctx?.previous) qc.setQueryData([...key], ctx.previous); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["sellers"] }); },
  });
}

export function useDeleteSeller() {
  const qc = useQueryClient();
  const key = ["sellers"] as const;

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      await withRetryQueue(async () => {
        const { error } = await supabase.from("sellers").delete().eq("id", id);
        if (error) throw error;
        return id;
      }, {
        entity: "sellers",
        operation: "delete",
        payload: { id },
        idempotencyKey: `seller-del-${id}`,
        originPath: "/sellers",
      });
      return id;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Seller[]>([...key]);
      qc.setQueryData<Seller[]>([...key], (old) => (old ?? []).filter((s) => s.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => { if (ctx?.previous) qc.setQueryData([...key], ctx.previous); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["sellers"] }); },
  });
}

/**
 * Seller.products holds an array of either local product ids (e.g. "ginger") or UUIDs depending on
 * which store was canonical when the seller was saved. This helper normalizes to product rows
 * usable by the UI.
 */
export function resolveSellerProductIds(
  seller: Pick<Seller, "products">,
  allProducts: ProductProfile[]
): ProductProfile[] {
  const list: ProductProfile[] = [];
  const byId = new Map<string, ProductProfile>();
  const byPrefix = new Map<string, ProductProfile>();
  for (const p of allProducts) {
    byId.set(p.id, p);
    byPrefix.set(p.prefix.toLowerCase(), p);
  }
  for (const ref of seller.products ?? []) {
    const hit = byId.get(ref) ?? byPrefix.get(String(ref).toLowerCase());
    if (hit) list.push(hit);
  }
  return list;
}
