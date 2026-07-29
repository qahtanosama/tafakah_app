"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Cargo, CostLine, CostSheet, FxRates } from "@/types/quote";
import { useProducts } from "@/lib/data/products";
import { useCostSheets, useLatestCostSheet, useSaveCostSheet, todayKey } from "@/lib/data/cost-sheets";
import {
  DEFAULT_CARTONS,
  DEFAULT_FX,
  DEFAULT_MARGIN,
  MARGIN_MAX,
  MARGIN_MIN,
  defaultCostLines,
  newCostLine,
} from "@/lib/quote/defaults";
import { stampIfAmountChanged } from "@/lib/quote/freshness";
import { defaultRoute } from "@/lib/quote/quote-text";
import { computeQuote } from "@/lib/quote/pricing";
import {
  getLangSnapshot,
  getServerLangSnapshot,
  langHydrated,
  setStoredLang,
  subscribeLang,
} from "@/lib/quote/prefs-store";
import { legacyLocalSheet } from "@/lib/quote/storage";
import type { QuoteLang } from "@/lib/quote/storage";

/** Debounce on the auto-save. Long enough that typing a rate is one write. */
const SAVE_DEBOUNCE_MS = 900;

/** The sheet currently on screen, before it has been saved. */
interface WorkingSheet {
  productId: string;
  lines: CostLine[];
  fx: FxRates;
  marginPct: number;
  /** Where these numbers came from — drives the "copied from…" notice. */
  origin: "saved" | "copied" | "blank" | "reopened";
  /** Session date of the sheet being viewed, when an older one was reopened. */
  reopenedFrom?: string;
}

/**
 * All calculator state: the shipment, the working cost sheet, and the derived
 * quote.
 *
 * Cost sheets are per product and shared with the team (Supabase), one session
 * per product per day. Opening a product restores its last costs, so a re-quote
 * is usually just a farm-price edit. A product never costed before is seeded
 * from the most recent sheet of any product — customs, inland and bank charges
 * are effectively constant across products, so only the farm price needs typing.
 *
 * Deliberately effect-free: loading, seeding and product switching are all
 * derived during render. The old version copied a product's default weights in
 * via an effect, which meant any refetch of the products query — including a
 * teammate's unrelated edit arriving over the realtime channel — silently
 * overwrote the carton weight a live quote was priced on.
 */
export function useQuoteCalculator() {
  const { data: productsData, isLoading: productsLoading } = useProducts();
  const products = useMemo(() => productsData ?? [], [productsData]);

  const [productChoice, setProductChoice] = useState("");
  const product = useMemo(
    () => products.find((p) => p.id === productChoice) ?? products[0],
    [products, productChoice]
  );
  const productId = product?.id ?? "";

  const { data: sheetsData, isLoading: sheetsLoading } = useCostSheets(productId || undefined);
  const sheets = useMemo(() => sheetsData ?? [], [sheetsData]);
  const { data: latestAnySheet, isLoading: latestLoading } = useLatestCostSheet();
  const saveSheet = useSaveCostSheet();

  const langState = useSyncExternalStore(subscribeLang, getLangSnapshot, getServerLangSnapshot);

  const [containers, setContainers] = useState(1);
  // null until the user types one, so the product's own boxes-per-container wins.
  const [cartonsOverride, setCartonsOverride] = useState<{ productId: string; cartons: number } | null>(null);
  const [weights, setWeights] = useState<{ productId: string; nw: number; gw: number } | null>(null);
  const [route, setRoute] = useState<{ loadingPort: string; dischargePort: string } | null>(null);
  const [working, setWorking] = useState<WorkingSheet | null>(null);

  /* ── the sheet on screen ───────────────────────────────────────────── */

  // Newest saved session for this product, if any.
  const savedSheet = sheets[0];

  /**
   * Seeded during render rather than in an effect. `working` is only set once
   * the user edits something, so merely browsing products never files a session.
   */
  const sheet: WorkingSheet = useMemo(() => {
    if (working?.productId === productId) return working;
    return seedSheet(productId, savedSheet, latestAnySheet ?? null);
  }, [working, productId, savedSheet, latestAnySheet]);

  const cargo: Cargo = useMemo(() => {
    const owned = weights?.productId === productId ? weights : null;
    const ownedCartons = cartonsOverride?.productId === productId ? cartonsOverride : null;
    // A reopened or saved sheet remembers the shipment it was costed for.
    const savedCargo = savedSheet?.cargo ?? {};
    const fallbackRoute = defaultRoute();
    return {
      productId,
      containers,
      // The product's pack format is the real answer here; the generic default
      // only applies to a product whose boxes-per-container is not set yet.
      cartonsPerContainer:
        ownedCartons?.cartons ??
        savedCargo.cartonsPerContainer ??
        (product?.defaultCartons || DEFAULT_CARTONS),
      nwPerCarton: owned?.nw ?? savedCargo.nwPerCarton ?? product?.defaultNW ?? 0,
      gwPerCarton: owned?.gw ?? savedCargo.gwPerCarton ?? product?.defaultGW ?? 0,
      loadingPort: route?.loadingPort ?? savedCargo.loadingPort ?? fallbackRoute.loadingPort,
      dischargePort: route?.dischargePort ?? savedCargo.dischargePort ?? fallbackRoute.dischargePort,
    };
  }, [productId, containers, cartonsOverride, weights, route, savedSheet, product]);

  const quote = useMemo(
    () =>
      computeQuote({
        lines: sheet.lines,
        cargo,
        fx: sheet.fx,
        marginPct: sheet.marginPct,
        productSelected: Boolean(product),
      }),
    [sheet, cargo, product]
  );

  /* ── auto-save ─────────────────────────────────────────────────────── */

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ sheet: WorkingSheet; cargo: Cargo; quotedPerMT: number } | null>(null);

  const scheduleSave = useCallback(
    (next: WorkingSheet, nextCargo: Cargo, quotedPerMT: number) => {
      // Nothing costed yet — do not file an empty session.
      if (!next.productId || !next.lines.some((l) => l.amount > 0)) return;
      pending.current = { sheet: next, cargo: nextCargo, quotedPerMT };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const p = pending.current;
        saveTimer.current = null;
        pending.current = null;
        if (!p) return;
        saveSheet.mutate({
          productId: p.sheet.productId,
          lines: p.sheet.lines,
          fx: p.sheet.fx,
          marginPct: p.sheet.marginPct,
          quotedPerMT: p.quotedPerMT,
          cargo: {
            containers: p.cargo.containers,
            cartonsPerContainer: p.cargo.cartonsPerContainer,
            nwPerCarton: p.cargo.nwPerCarton,
            gwPerCarton: p.cargo.gwPerCarton,
            loadingPort: p.cargo.loadingPort,
            dischargePort: p.cargo.dischargePort,
          },
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [saveSheet]
  );

  /**
   * Every mutation funnels through here: it advances the working sheet, marks it
   * as the user's own (so it stops being a seed), and queues the save.
   */
  const edit = useCallback(
    (change: (prev: WorkingSheet) => WorkingSheet) => {
      const next = { ...change(sheet), productId, origin: "saved" as const, reopenedFrom: undefined };
      setWorking(next);
      const q = computeQuote({
        lines: next.lines,
        cargo,
        fx: next.fx,
        marginPct: next.marginPct,
        productSelected: Boolean(product),
      });
      scheduleSave(next, cargo, q.quotedPerMT);
    },
    [sheet, productId, cargo, product, scheduleSave]
  );

  /* ── mutators ──────────────────────────────────────────────────────── */

  const updateCargo = useCallback(
    (patch: Partial<Cargo>) => {
      if (patch.productId !== undefined) setProductChoice(patch.productId);
      if (patch.containers !== undefined) setContainers(patch.containers);
      if (patch.cartonsPerContainer !== undefined) {
        setCartonsOverride({
          productId: patch.productId ?? productId,
          cartons: patch.cartonsPerContainer,
        });
      }
      if (patch.loadingPort !== undefined || patch.dischargePort !== undefined) {
        setRoute({
          loadingPort: patch.loadingPort ?? cargo.loadingPort,
          dischargePort: patch.dischargePort ?? cargo.dischargePort,
        });
      }
      if (patch.nwPerCarton !== undefined || patch.gwPerCarton !== undefined) {
        setWeights({
          productId: patch.productId ?? productId,
          nw: patch.nwPerCarton ?? cargo.nwPerCarton,
          gw: patch.gwPerCarton ?? cargo.gwPerCarton,
        });
      }
    },
    [productId, cargo.nwPerCarton, cargo.gwPerCarton, cargo.loadingPort, cargo.dischargePort]
  );

  const updateLine = useCallback(
    (id: string, patch: Partial<CostLine>) => {
      edit((prev) => ({
        ...prev,
        lines: prev.lines.map((l) => (l.id === id ? stampIfAmountChanged(l, { ...l, ...patch }) : l)),
      }));
    },
    [edit]
  );

  const addLine = useCallback(() => {
    edit((prev) => ({ ...prev, lines: [...prev.lines, newCostLine()] }));
  }, [edit]);

  const removeLine = useCallback(
    (id: string) => {
      edit((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.id !== id) }));
    },
    [edit]
  );

  const setFx = useCallback(
    (patch: Partial<FxRates>) => {
      edit((prev) => ({ ...prev, fx: { ...prev.fx, ...patch } }));
    },
    [edit]
  );

  // Clamped here so the slider and the number box can never disagree.
  const setMargin = useCallback(
    (marginPct: number) => {
      const safe = Number.isFinite(marginPct) ? marginPct : 0;
      edit((prev) => ({ ...prev, marginPct: Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, safe)) }));
    },
    [edit]
  );

  /** Load an older session's costs onto the sheet, without saving over today's. */
  const reopenSession = useCallback((older: CostSheet) => {
    setWorking({
      productId: older.productId,
      lines: older.lines,
      fx: older.fx,
      marginPct: older.marginPct,
      origin: "reopened",
      reopenedFrom: older.sessionDate,
    });
  }, []);

  /** Drop a reopened session and return to the current working sheet. */
  const closeReopened = useCallback(() => setWorking(null), []);

  const setLang = useCallback((next: QuoteLang) => setStoredLang(next), []);

  return {
    products,
    product,
    /** True until products, this product's sheets and the seed sheet are all in hand. */
    loading: productsLoading || sheetsLoading || latestLoading || !langHydrated(langState),
    cargo,
    updateCargo,
    lines: sheet.lines,
    origin: sheet.origin,
    reopenedFrom: sheet.reopenedFrom,
    updateLine,
    addLine,
    removeLine,
    fx: sheet.fx,
    setFx,
    marginPct: sheet.marginPct,
    setMargin,
    lang: langState.lang,
    setLang,
    quote,
    /** Saved sessions, newest first. `[0]` is today's if one has been saved. */
    sessions: sheets,
    reopenSession,
    closeReopened,
    saving: saveSheet.isPending,
    /**
     * Set when a save was rejected — most likely the migration for
     * product_cost_sheets has not been run yet. The calculator keeps working on
     * in-memory costs; the caller surfaces this so the failure is not silent.
     */
    saveError: saveSheet.isError,
    todaySaved: savedSheet?.sessionDate === todayKey(),
  };
}

/**
 * Where a freshly-opened product's costs come from, in order of preference:
 * its own last session, then the most recent sheet of any product (so only the
 * farm price needs retyping), then whatever the old per-browser localStorage
 * defaults held, then blank.
 */
function seedSheet(
  productId: string,
  own: CostSheet | undefined,
  latestAny: CostSheet | null
): WorkingSheet {
  if (own) {
    return { productId, lines: own.lines, fx: own.fx, marginPct: own.marginPct, origin: "saved" };
  }
  if (latestAny) {
    return {
      productId,
      // Carry the cost structure across, but not the farm price — that is
      // product-specific and the one number that must not be inherited.
      lines: latestAny.lines.map((l) =>
        l.id === "farm" ? { ...l, amount: 0, updatedAt: undefined } : l
      ),
      fx: latestAny.fx,
      marginPct: latestAny.marginPct,
      origin: "copied",
    };
  }
  // First run on a machine that used the pre-Supabase calculator: adopt the
  // fees that were sitting in localStorage so they are not silently lost.
  const legacy = legacyLocalSheet();
  if (legacy) {
    return { productId, lines: legacy.lines, fx: legacy.fx, marginPct: legacy.marginPct, origin: "copied" };
  }
  return {
    productId,
    lines: defaultCostLines(),
    fx: { ...DEFAULT_FX },
    marginPct: DEFAULT_MARGIN,
    origin: "blank",
  };
}

export type QuoteCalculatorState = ReturnType<typeof useQuoteCalculator>;
