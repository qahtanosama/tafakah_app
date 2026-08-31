"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Cargo, CostLine, CostSheet, FxRates, MarketId } from "@/types/quote";
import { DEFAULT_MARKET } from "@/lib/quote/markets";
import { createClient } from "@/lib/supabase/client";
import { withRetryQueue } from "@/lib/db/helpers";
import { DEFAULT_FX } from "@/lib/quote/defaults";

/**
 * Per-product cost sheets — see supabase/migrations/…_product_cost_sheets.sql.
 * One row per product per day; the newest row is the working sheet, older rows
 * are the session history.
 */

interface DbCostSheet {
  id: string;
  product_id: string;
  market: string | null;
  session_date: string;
  lines: CostLine[] | null;
  fx: Partial<FxRates> | null;
  margin_pct: number | string | null;
  quoted_per_mt: number | string | null;
  cargo: Partial<Cargo> | null;
  created_at: string;
  updated_at: string;
}

/** numeric columns come back as strings from PostgREST. */
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function dbToLocal(row: DbCostSheet): CostSheet {
  return {
    id: row.id,
    productId: row.product_id,
    market: (row.market ?? DEFAULT_MARKET) as MarketId,
    sessionDate: row.session_date,
    lines: Array.isArray(row.lines) ? row.lines : [],
    fx: { ...DEFAULT_FX, ...(row.fx ?? {}) },
    marginPct: num(row.margin_pct) ?? 20,
    quotedPerMT: num(row.quoted_per_mt),
    cargo: row.cargo ?? {},
    updatedAt: row.updated_at,
  };
}

/** Local calendar date as YYYY-MM-DD — the session key. */
export function todayKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const HISTORY_LIMIT = 12;

/**
 * Every saved session for one product, newest first. `[0]` is the working sheet.
 * Disabled until a product is selected so switching products does not fire a
 * query for the empty id.
 */
export function useCostSheets(productId: string | undefined, market: MarketId) {
  useRealtimeCostSheets();
  return useQuery<CostSheet[]>({
    queryKey: ["cost-sheets", productId ?? "", market],
    enabled: Boolean(productId),
    // One attempt: if the table is missing (migration not yet run) or RLS
    // refuses, retrying cannot help — the calculator falls back to defaults and
    // stays usable rather than sitting on a spinner.
    retry: false,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("product_cost_sheets")
        .select("*")
        .eq("product_id", productId!)
        .eq("market", market)
        .order("session_date", { ascending: false })
        .limit(HISTORY_LIMIT);
      if (error) throw error;
      return (data as unknown as DbCostSheet[]).map(dbToLocal);
    },
  });
}

/**
 * The most recently saved sheet for any product IN THIS MARKET — used to seed a
 * product that has never been costed, so the team retypes only the farm price
 * instead of every line. Customs, inland and bank charges are usually identical
 * across products and freight is close.
 *
 * Scoped to the market deliberately. Across markets these costs have nothing to
 * do with each other: seeding a Gulf quote from a Russian sheet would hand it a
 * RMB overland freight and a Kazakh transit tax.
 */
export function useLatestCostSheet(market: MarketId) {
  return useQuery<CostSheet | null>({
    queryKey: ["cost-sheets", "latest-any", market],
    retry: false,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("product_cost_sheets")
        .select("*")
        .eq("market", market)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? dbToLocal(data as unknown as DbCostSheet) : null;
    },
  });
}

function useRealtimeCostSheets() {
  const qc = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    // Unique channel name per mount — see the note in data/buyers.ts (Strict Mode).
    const channelName = `public:product_cost_sheets:${Math.random().toString(36).slice(2, 9)}`;
    const ch = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_cost_sheets" }, () => {
        qc.invalidateQueries({ queryKey: ["cost-sheets"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);
}

export interface SaveCostSheetInput {
  productId: string;
  market: MarketId;
  lines: CostLine[];
  fx: FxRates;
  marginPct: number;
  quotedPerMT: number | null;
  cargo: Partial<Cargo>;
}

/**
 * Upserts today's session for a product in a market. The unique
 * (product_id, market, session_date) constraint is what makes this a single
 * round trip: same-day edits update today's row, and the first save on a new
 * day inserts the next session.
 */
export function useSaveCostSheet() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveCostSheetInput) => {
      const supabase = createClient();
      const sessionDate = todayKey();
      const row = {
        product_id: input.productId,
        market: input.market,
        session_date: sessionDate,
        lines: input.lines,
        fx: input.fx,
        margin_pct: input.marginPct,
        quoted_per_mt: input.quotedPerMT,
        cargo: input.cargo,
      };

      const result = await withRetryQueue(
        async () => {
          const { data, error } = await supabase
            .from("product_cost_sheets")
            .upsert(row as never, { onConflict: "product_id,market,session_date" })
            .select()
            .single();
          if (error) throw error;
          return dbToLocal(data as unknown as DbCostSheet);
        },
        {
          entity: "product_cost_sheets",
          operation: "upsert",
          payload: row,
          conflictTarget: "product_id,market,session_date",
          // Stable per product per market per day, so a queued offline save
          // replays once rather than filing a duplicate session — and never
          // replays into the other market.
          idempotencyKey: `cost-sheet-${input.productId}-${input.market}-${sessionDate}`,
          originPath: "/products/calculator",
        }
      );
      return result === "queued" ? null : result;
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["cost-sheets", input.productId, input.market] });
      qc.invalidateQueries({ queryKey: ["cost-sheets", "latest-any", input.market] });
    },
  });
}
