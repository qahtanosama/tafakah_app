"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Cargo, CostLine, CostSheet, FxRates, MarketId } from "@/types/quote";
import { useProducts, useSavePack } from "@/lib/data/products";
import { useCostSheets, useLatestCostSheet, useSaveCostSheet, todayKey } from "@/lib/data/cost-sheets";
import {
  DEFAULT_CARTONS,
  DEFAULT_FX,
  DEFAULT_MARGIN,
  MARGIN_MAX,
  MARGIN_MIN,
  newCostLine,
} from "@/lib/quote/defaults";
import { stampIfAmountChanged } from "@/lib/quote/freshness";
import { DEFAULT_MARKET, type Market, marketOf } from "@/lib/quote/markets";
import { type PackPatch, packFor } from "@/lib/quote/pack";
import { DEFAULT_PAYMENT_TERM_ID, paymentTermById } from "@/lib/payment-terms";
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

/** A positive number, or undefined when the field is simply not filled in. */
function set(n: number | undefined): number | undefined {
  return typeof n === "number" && n > 0 ? n : undefined;
}

/** The sheet currently on screen, before it has been saved. */
interface WorkingSheet {
  productId: string;
  /** Which market these costs are for — a Gulf sheet is not a Russian one. */
  market: MarketId;
  lines: CostLine[];
  fx: FxRates;
  marginPct: number;
  /** Where these numbers came from — drives the "copied from…" notice. */
  origin: "saved" | "copied" | "blank" | "reopened";
  /** Session date of the sheet being viewed, when an older one was reopened. */
  reopenedFrom?: string;
}

/**
 * All calculator state: the market, the shipment, the working cost sheet, and
 * the derived quote.
 *
 * Cost sheets are per product PER MARKET and shared with the team (Supabase),
 * one session per product per market per day. Opening a product restores its last costs, so a re-quote
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

  const [marketId, setMarketId] = useState<MarketId>(DEFAULT_MARKET);
  const market = useMemo(() => marketOf(marketId), [marketId]);

  const [productChoice, setProductChoice] = useState("");
  const product = useMemo(
    () => products.find((p) => p.id === productChoice) ?? products[0],
    [products, productChoice]
  );
  const productId = product?.id ?? "";

  const { data: sheetsData, isLoading: sheetsLoading } = useCostSheets(productId || undefined, marketId);
  const sheets = useMemo(() => sheetsData ?? [], [sheetsData]);
  const { data: latestAnySheet, isLoading: latestLoading } = useLatestCostSheet(marketId);
  const saveSheet = useSaveCostSheet();
  const savePackMutation = useSavePack();

  const langState = useSyncExternalStore(subscribeLang, getLangSnapshot, getServerLangSnapshot);

  const [containers, setContainers] = useState(1);
  // null until the user types one, so the product's own boxes-per-container wins.
  const [cartonsOverride, setCartonsOverride] = useState<
    { productId: string; market: MarketId; cartons: number } | null
  >(null);
  const [weights, setWeights] = useState<
    { productId: string; market: MarketId; nw: number; gw: number } | null
  >(null);
  const [route, setRoute] = useState<{ loadingPort: string; dischargePort: string } | null>(null);
  const [etd, setEtd] = useState<string | null>(null);
  // null until chosen this session, so a saved sheet's terms win first.
  const [paymentTerm, setPaymentTerm] = useState<string | null>(null);
  const [working, setWorking] = useState<WorkingSheet | null>(null);

  /* ── the sheet on screen ───────────────────────────────────────────── */

  // Newest saved session for this product, if any.
  const savedSheet = sheets[0];

  /** This product's pack format in this market — boxes, weights, unit, tax. */
  const pack = useMemo(() => packFor(product, marketId), [product, marketId]);

  /**
   * Seeded during render rather than in an effect. `working` is only set once
   * the user edits something, so merely browsing products never files a session.
   * Keyed on market as well as product: switching market re-seeds from that
   * market's own template rather than carrying the other one's cost lines over.
   */
  const sheet: WorkingSheet = useMemo(() => {
    if (working?.productId === productId && working.market === marketId) return working;
    return seedSheet(productId, market, pack.transitTaxPerMT, savedSheet, latestAnySheet ?? null);
  }, [working, productId, marketId, market, pack.transitTaxPerMT, savedSheet, latestAnySheet]);

  const cargo: Cargo = useMemo(() => {
    const owned = weights?.productId === productId && weights.market === marketId ? weights : null;
    const ownedCartons =
      cartonsOverride?.productId === productId && cartonsOverride.market === marketId
        ? cartonsOverride
        : null;
    // A reopened or saved sheet remembers the shipment it was costed for.
    const savedCargo = savedSheet?.cargo ?? {};
    // An overland market states its own route; the Gulf takes the contract default.
    const marketRoute = market.defaultRoute ?? defaultRoute();
    // Overland loads at the packhouse, so the FCA named place is the product's
    // own origin — "FCA Anqiu" for ginger, not the border crossing it passes
    // through later. A product with no origin recorded falls back to the
    // market's default place rather than quoting FCA with no place at all.
    const fallbackRoute = {
      loadingPort:
        (market.mode === "overland" && product?.origin?.trim()) || marketRoute.loadingPort,
      dischargePort: marketRoute.dischargePort,
    };
    return {
      productId,
      containers,
      // Product data outranks the saved sheet. Boxes-per-container and the
      // carton weights are properties of the pack format that the team
      // maintains on the Products page; a cost sheet only ever held a snapshot
      // of them. Letting the snapshot win meant setting 1,445 boxes on Fresh
      // Apple changed nothing, because a sheet saved earlier still said 9,700 —
      // which silently mis-states quantity, price per MT and the total.
      // A value typed on this screen wins immediately AND is written back to
      // the product's pack for this market (see savePack), so it is still there
      // next session rather than reverting to the stored default.
      // `set()` and not `??`: these columns are NOT NULL DEFAULT 0, so 0 means
      // "not filled in yet", not "zero boxes". Using ?? would let an unset
      // product default beat a real saved value.
      // `pack` already applies the market override, the product default and the
      // generic fallback in that order — see lib/quote/pack.ts.
      cartonsPerContainer:
        ownedCartons?.cartons ?? set(pack.cartons) ?? set(savedCargo.cartonsPerContainer) ?? DEFAULT_CARTONS,
      nwPerCarton: owned?.nw ?? set(pack.nw) ?? set(savedCargo.nwPerCarton) ?? 0,
      gwPerCarton: owned?.gw ?? set(pack.gw) ?? set(savedCargo.gwPerCarton) ?? 0,
      loadingPort: route?.loadingPort ?? savedCargo.loadingPort ?? fallbackRoute.loadingPort,
      dischargePort: route?.dischargePort ?? savedCargo.dischargePort ?? fallbackRoute.dischargePort,
      // Never inherited from a saved sheet: a departure date is specific to the
      // sailing being quoted, and silently reusing last week's would put a date
      // already in the past on a live offer.
      etd: etd ?? "",
    };
  }, [productId, marketId, containers, cartonsOverride, weights, route, etd, savedSheet, pack, market, product?.origin]);

  /**
   * How the buyer pays. Chosen this session, else whatever this product's last
   * session in this market agreed, else the standing default.
   */
  const paymentTermId =
    paymentTerm ?? (savedSheet?.paymentTermId || DEFAULT_PAYMENT_TERM_ID);
  const paymentTerm_ = paymentTermById(paymentTermId);

  const quote = useMemo(
    () =>
      computeQuote({
        lines: sheet.lines,
        cargo,
        fx: sheet.fx,
        marginPct: sheet.marginPct,
        productSelected: Boolean(product),
        markupBase: market.markupBase,
      }),
    [sheet, cargo, product, market.markupBase]
  );

  /* ── auto-save ─────────────────────────────────────────────────────── */

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{
    sheet: WorkingSheet;
    cargo: Cargo;
    quotedPerMT: number;
    paymentTermId: string;
  } | null>(null);

  const scheduleSave = useCallback(
    (next: WorkingSheet, nextCargo: Cargo, quotedPerMT: number, termId: string) => {
      // Nothing costed yet — do not file an empty session.
      if (!next.productId || !next.lines.some((l) => l.amount > 0)) return;
      pending.current = { sheet: next, cargo: nextCargo, quotedPerMT, paymentTermId: termId };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const p = pending.current;
        saveTimer.current = null;
        pending.current = null;
        if (!p) return;
        saveSheet.mutate({
          productId: p.sheet.productId,
          market: p.sheet.market,
          lines: p.sheet.lines,
          fx: p.sheet.fx,
          marginPct: p.sheet.marginPct,
          quotedPerMT: p.quotedPerMT,
          paymentTermId: p.paymentTermId,
          cargo: {
            containers: p.cargo.containers,
            cartonsPerContainer: p.cargo.cartonsPerContainer,
            nwPerCarton: p.cargo.nwPerCarton,
            gwPerCarton: p.cargo.gwPerCarton,
            loadingPort: p.cargo.loadingPort,
            dischargePort: p.cargo.dischargePort,
            etd: p.cargo.etd,
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
      const next = {
        ...change(sheet),
        productId,
        market: marketId,
        origin: "saved" as const,
        reopenedFrom: undefined,
      };
      setWorking(next);
      const q = computeQuote({
        lines: next.lines,
        cargo,
        fx: next.fx,
        marginPct: next.marginPct,
        productSelected: Boolean(product),
        markupBase: market.markupBase,
      });
      scheduleSave(next, cargo, q.quotedPerMT, paymentTermId);
    },
    [sheet, productId, marketId, cargo, product, market.markupBase, paymentTermId, scheduleSave]
  );

  /* ── mutators ──────────────────────────────────────────────────────── */

  /**
   * Packaging typed on the shipment bar is written back to the product, so it
   * is there again next session and on the Products page instead of being lost
   * with the tab. The Gulf writes the product's own columns; another market
   * writes its entry in `market_packs`.
   *
   * Debounced like the cost-sheet save, so typing "1500" is one write and not
   * four. The mutation touches only the pack columns and merges against what
   * the database holds — see useSavePack for why that matters.
   */
  const packTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPack = useRef<PackPatch | null>(null);

  const savePack = useCallback(
    (patch: PackPatch) => {
      if (!product) return;
      pendingPack.current = { ...pendingPack.current, ...patch };
      if (packTimer.current) clearTimeout(packTimer.current);
      packTimer.current = setTimeout(() => {
        const p = pendingPack.current;
        packTimer.current = null;
        pendingPack.current = null;
        if (!p || !productId) return;
        savePackMutation.mutate({
          productId,
          market: marketId,
          isDefaultMarket: marketId === DEFAULT_MARKET,
          patch: p,
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [product, productId, marketId, savePackMutation]
  );

  const updateCargo = useCallback(
    (patch: Partial<Cargo>) => {
      if (patch.productId !== undefined) setProductChoice(patch.productId);
      if (patch.containers !== undefined) setContainers(patch.containers);
      if (patch.cartonsPerContainer !== undefined) {
        setCartonsOverride({
          productId: patch.productId ?? productId,
          market: marketId,
          cartons: patch.cartonsPerContainer,
        });
        savePack({ cartons: patch.cartonsPerContainer });
      }
      if (patch.etd !== undefined) setEtd(patch.etd);
      if (patch.loadingPort !== undefined || patch.dischargePort !== undefined) {
        setRoute({
          loadingPort: patch.loadingPort ?? cargo.loadingPort,
          dischargePort: patch.dischargePort ?? cargo.dischargePort,
        });
      }
      if (patch.nwPerCarton !== undefined || patch.gwPerCarton !== undefined) {
        setWeights({
          productId: patch.productId ?? productId,
          market: marketId,
          nw: patch.nwPerCarton ?? cargo.nwPerCarton,
          gw: patch.gwPerCarton ?? cargo.gwPerCarton,
        });
        savePack({ nw: patch.nwPerCarton, gw: patch.gwPerCarton });
      }
    },
    [productId, marketId, savePack, cargo.nwPerCarton, cargo.gwPerCarton, cargo.loadingPort, cargo.dischargePort]
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
  const setMarket = useCallback((next: MarketId) => {
    setMarketId(next);
    // The route belongs to the market: a Gulf port on a Russian quote, or the
    // reverse, is a factual error on a client-facing offer. Same for the
    // working sheet, whose cost lines are the other market's entirely.
    setRoute(null);
    setWorking(null);
  }, []);

  const reopenSession = useCallback((older: CostSheet) => {
    setWorking({
      productId: older.productId,
      market: older.market,
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

  /**
   * Choosing terms files the session on its own, so the choice survives a
   * reload even when no cost line was touched. `edit` funnels every other
   * mutation; this one has no line to change, so it re-saves the sheet as is.
   */
  const setPaymentTermId = useCallback(
    (next: string) => {
      setPaymentTerm(next);
      scheduleSave({ ...sheet, market: marketId }, cargo, quote.quotedPerMT, next);
    },
    [sheet, marketId, cargo, quote.quotedPerMT, scheduleSave]
  );

  // A market offers only some quote languages, and the stored preference is
  // global — so Arabic must not survive a switch to Russia.
  const lang = market.langs.includes(langState.lang) ? langState.lang : market.langs[0];

  return {
    products,
    product,
    market,
    setMarket,
    pack,
    paymentTermId,
    paymentTerm: paymentTerm_,
    setPaymentTermId,
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
    lang,
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
  market: Market,
  transitTaxPerMT: number,
  own: CostSheet | undefined,
  latestAny: CostSheet | null
): WorkingSheet {
  const id = market.id;
  if (own) {
    return { productId, market: id, lines: own.lines, fx: own.fx, marginPct: own.marginPct, origin: "saved" };
  }
  if (latestAny) {
    return {
      productId,
      market: id,
      // Carry the cost structure across, but not the farm price — that is
      // product-specific and the one number that must not be inherited. The
      // transit tax is the opposite: a published per-ton rate that belongs to
      // the product, so it is seeded rather than carried.
      lines: latestAny.lines.map((l) => {
        if (l.id === "farm") return { ...l, amount: 0, updatedAt: undefined };
        if (l.id === "transit") return { ...l, amount: transitTaxPerMT, updatedAt: undefined };
        return l;
      }),
      fx: latestAny.fx,
      marginPct: latestAny.marginPct,
      origin: "copied",
    };
  }
  // First run on a machine that used the pre-Supabase calculator: adopt the
  // fees that were sitting in localStorage so they are not silently lost.
  // Gulf only — those were sea costs, and handing them to a Russian sheet is
  // exactly the cross-market contamination the market key exists to prevent.
  const legacy = id === "gulf" ? legacyLocalSheet() : null;
  if (legacy) {
    return { productId, market: id, lines: legacy.lines, fx: legacy.fx, marginPct: legacy.marginPct, origin: "copied" };
  }
  return {
    productId,
    market: id,
    lines: market.costLines().map((l) => (l.id === "transit" ? { ...l, amount: transitTaxPerMT } : l)),
    fx: { ...DEFAULT_FX },
    marginPct: DEFAULT_MARGIN,
    origin: "blank",
  };
}

export type QuoteCalculatorState = ReturnType<typeof useQuoteCalculator>;
