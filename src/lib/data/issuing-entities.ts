"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntityBankDetails, IssuingEntity } from "@/types/issuing-entity";
import { createClient } from "@/lib/supabase/client";
import { withRetryQueue } from "@/lib/db/helpers";

/**
 * Issuing entities — see supabase/migrations/…_issuing_entities.sql.
 * Team-only; a client has no business editing whose name is on the contract.
 */

interface DbIssuingEntity {
  id: string;
  name: string;
  name_cn: string | null;
  address_lines: string[] | null;
  legal_name: string;
  legal_address: string;
  tel: string | null;
  email: string | null;
  bank: Partial<EntityBankDetails> | null;
  logo_url: string | null;
  stamp_url: string | null;
  is_default: boolean;
  sort_order: number;
}

function dbToLocal(row: DbIssuingEntity): IssuingEntity {
  return {
    id: row.id,
    name: row.name,
    nameCn: row.name_cn ?? "",
    addressLines: Array.isArray(row.address_lines) ? row.address_lines : [],
    legalName: row.legal_name,
    legalAddress: row.legal_address,
    tel: row.tel ?? "",
    email: row.email ?? "",
    bank: {
      swift: row.bank?.swift ?? "",
      beneficiary: row.bank?.beneficiary ?? "",
      account: row.bank?.account ?? "",
      bank: row.bank?.bank ?? "",
      bankAddress: row.bank?.bankAddress ?? "",
      postCode: row.bank?.postCode ?? "",
    },
    logoUrl: row.logo_url ?? "",
    stampUrl: row.stamp_url ?? "",
    isDefault: Boolean(row.is_default),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function localToDb(e: IssuingEntity): Omit<DbIssuingEntity, "id"> & { id?: string } {
  return {
    ...(e.id ? { id: e.id } : {}),
    name: e.name.trim(),
    name_cn: e.nameCn.trim() || null,
    address_lines: e.addressLines.map((l) => l.trim()).filter(Boolean),
    legal_name: e.legalName.trim(),
    legal_address: e.legalAddress.trim(),
    tel: e.tel.trim(),
    email: e.email.trim(),
    bank: e.bank,
    logo_url: e.logoUrl.trim(),
    stamp_url: e.stampUrl.trim(),
    is_default: e.isDefault,
    sort_order: e.sortOrder,
  };
}

export function useIssuingEntities() {
  useRealtimeIssuingEntities();
  return useQuery<IssuingEntity[]>({
    queryKey: ["issuing-entities"],
    // One attempt: if the table is missing (migration not yet run) the
    // documents fall back to their built-in letterhead and stay usable.
    retry: false,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("issuing_entities")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data as unknown as DbIssuingEntity[]).map(dbToLocal);
    },
  });
}

function useRealtimeIssuingEntities() {
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    // Unique channel name per mount — see the note in data/buyers.ts (Strict Mode).
    const channelName = `public:issuing_entities:${Math.random().toString(36).slice(2, 9)}`;
    const ch = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "issuing_entities" }, () => {
        qc.invalidateQueries({ queryKey: ["issuing-entities"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);
}

export function useSaveIssuingEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entity: IssuingEntity) => {
      const supabase = createClient();
      const row = localToDb(entity);

      // Only one row may be default — the partial unique index enforces it, so
      // clear the old one first rather than letting the write fail.
      if (entity.isDefault) {
        const { error } = await supabase
          .from("issuing_entities")
          .update({ is_default: false })
          .neq("id", entity.id || "00000000-0000-0000-0000-000000000000");
        if (error) throw error;
      }

      const result = await withRetryQueue(
        async () => {
          const q = entity.id
            ? supabase.from("issuing_entities").update(row as never).eq("id", entity.id)
            : supabase.from("issuing_entities").insert(row as never);
          const { data, error } = await q.select().single();
          if (error) throw error;
          return dbToLocal(data as unknown as DbIssuingEntity);
        },
        {
          entity: "issuing_entities",
          operation: entity.id ? "update" : "insert",
          payload: row,
          idempotencyKey: `issuing-entity-${entity.id || crypto.randomUUID()}`,
          originPath: "/entities",
        }
      );
      return result === "queued" ? entity : result;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["issuing-entities"] });
    },
  });
}

export function useDeleteIssuingEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("issuing_entities").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["issuing-entities"] });
    },
  });
}
