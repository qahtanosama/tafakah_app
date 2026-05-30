"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Buyer, BuyerLanguage, BuyerDocPreset, BuyerMessageTemplate } from "@/types/buyer";
import { createClient } from "@/lib/supabase/client";
import { withRetryQueue } from "@/lib/db/helpers";

interface DbBuyer {
  id: string;
  company_name: string;
  company_name_cn: string | null;
  contact_name: string;
  whatsapp_number: string | null;
  phone_number: string | null;
  email: string | null;
  preferred_language: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  default_doc_preset: string | null;
  custom_message_template: Record<string, unknown> | null;
  portal_enabled: boolean;
  notes: string | null;
  short_name: string;
  additional_number: string;
  cc_email: string;
  created_at: string;
  updated_at: string;
}

function dbToLocal(row: DbBuyer): Buyer {
  return {
    id: row.id,
    company: row.company_name,
    shortName: row.short_name ?? "",
    address: row.address ?? "",
    additionalNumber: row.additional_number ?? "",
    cityPostal: row.city ?? "",
    country: row.country ?? "",
    email: row.email ?? "",
    ccEmail: row.cc_email ?? "",
    phone: row.phone_number ?? "",
    contactPerson: row.contact_name,
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    whatsappNumber: row.whatsapp_number ?? "",
    preferredLanguage: (row.preferred_language as BuyerLanguage | null) ?? "en",
    defaultDocPreset: (row.default_doc_preset as BuyerDocPreset | null) ?? "buyer",
    customMessageTemplate: (row.custom_message_template as BuyerMessageTemplate | null) ?? {},
  };
}

function localToDb(b: Buyer) {
  return {
    id: b.id,
    company_name: b.company,
    company_name_cn: null,
    contact_name: b.contactPerson || b.shortName || b.company,
    whatsapp_number: b.whatsappNumber || null,
    phone_number: b.phone || null,
    email: b.email || null,
    preferred_language: b.preferredLanguage ?? null,
    country: b.country || null,
    city: b.cityPostal || null,
    address: b.address || null,
    default_doc_preset: b.defaultDocPreset ?? null,
    custom_message_template: b.customMessageTemplate ?? null,
    notes: b.notes || null,
    short_name: b.shortName || "",
    additional_number: b.additionalNumber || "",
    cc_email: b.ccEmail || "",
  };
}

export function useBuyers() {
  useRealtimeBuyers();
  return useQuery<Buyer[]>({
    queryKey: ["buyers"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("buyers").select("*").order("company_name");
      if (error) throw error;
      return (data as unknown as DbBuyer[]).map(dbToLocal);
    },
  });
}

function useRealtimeBuyers() {
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel("public:buyers")
      .on("postgres_changes", { event: "*", schema: "public", table: "buyers" }, () => {
        qc.invalidateQueries({ queryKey: ["buyers"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);
}

export function useSaveBuyer() {
  const qc = useQueryClient();
  const key = ["buyers"] as const;

  return useMutation({
    mutationFn: async ({ payload: buyer, isUpdate }: { payload: Buyer; isUpdate: boolean }) => {
      const supabase = createClient();
      const row = localToDb(buyer);
      const result = await withRetryQueue(async () => {
        if (isUpdate) {
          const { id: _, ...rest } = row;
          const { data, error } = await supabase.from("buyers").update(rest as never).eq("id", buyer.id).select().single();
          if (error) throw error;
          return dbToLocal(data as unknown as DbBuyer);
        }
        const { id: _, ...rest } = row;
        const { data, error } = await supabase.from("buyers").insert(rest as never).select().single();
        if (error) throw error;
        return dbToLocal(data as unknown as DbBuyer);
      }, {
        entity: "buyers",
        operation: isUpdate ? "update" : "insert",
        payload: { ...row, id: isUpdate ? buyer.id : undefined },
        idempotencyKey: `buyer-${buyer.id || crypto.randomUUID()}`,
        originPath: "/buyers",
      });
      return result === "queued" ? buyer : result;
    },
    onMutate: async ({ payload: buyer }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Buyer[]>([...key]);
      qc.setQueryData<Buyer[]>([...key], (old) => {
        if (!old) return [buyer];
        const idx = old.findIndex((b) => b.id === buyer.id);
        if (idx >= 0) { const next = [...old]; next[idx] = buyer; return next; }
        return [...old, buyer];
      });
      return { previous };
    },
    onError: (_err, _buyer, ctx) => { if (ctx?.previous) qc.setQueryData([...key], ctx.previous); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["buyers"] }); },
  });
}

export function useDeleteBuyer() {
  const qc = useQueryClient();
  const key = ["buyers"] as const;

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      await withRetryQueue(async () => {
        const { error } = await supabase.from("buyers").delete().eq("id", id);
        if (error) throw error;
        return id;
      }, {
        entity: "buyers",
        operation: "delete",
        payload: { id },
        idempotencyKey: `buyer-del-${id}`,
        originPath: "/buyers",
      });
      return id;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Buyer[]>([...key]);
      qc.setQueryData<Buyer[]>([...key], (old) => (old ?? []).filter((b) => b.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => { if (ctx?.previous) qc.setQueryData([...key], ctx.previous); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["buyers"] }); },
  });
}
