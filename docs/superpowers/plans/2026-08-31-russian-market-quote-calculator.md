# Russian Market in the Quote Calculator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Quote Calculator price and quote the Russian market — its own pack format per product, overland route and incoterms, RMB-denominated cost stack with a Kazakh transit tax, and a Russian-language offer — without changing a single Gulf number.

**Architecture:** A `Market` profile object in code carries everything that differs (transport mode, incoterm pair, destination list, cost-line template, price shape, markup base, offered languages). Per-product pack formats live in a `products.market_packs` JSONB column, leaving existing columns as the Gulf pack. `market` joins the cost-sheet key so the two markets cannot overwrite or seed each other.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2, TypeScript 5, Supabase (PostgREST + RLS), TanStack Query v5, Tailwind v4, `@react-pdf/renderer`. Vitest is added by Task 1 — the project currently has no JS test runner.

**Spec:** `docs/superpowers/specs/2026-08-31-russian-market-quote-calculator-design.md`

## Global Constraints

- **No Gulf quote may move by a cent.** Task 1 pins current `computeQuote` output; it must stay green through every later task.
- **Read the guide in `node_modules/next/dist/docs/` before writing code.** Per `AGENTS.md`, this Next.js differs from training data. Heed deprecation notices.
- **Migrations are applied by hand** in the Supabase SQL editor. Do not run `supabase db push`. Each migration is written to be re-runnable (`if not exists`, `if exists`).
- **The team dictionary is typed:** `zh` is typed against `en`, so a key added to one and not the other is a compile error. Every new string needs both.
- **Two language axes, never mixed.** Team UI = `en`/`zh` (`src/lib/team-i18n`). Quote output = `en`/`ar`/`ru` (`QuoteLang`). Chinese never reaches buyer-facing output.
- **Quotes go out as NAWA FRESH**; contract and invoice PDFs keep the TAFAKAH Shanghai entity. This split is deliberate — do not "fix" it.
- **No RUB.** The Russian trade is costed in RMB and priced in USD. Do not add RUB to `CURRENCIES`.
- **Cost sheets are team-only.** `product_cost_sheets` has no client RLS policy by design; do not add one.

---

### Task 1: Vitest, and a regression pin on today's Gulf quote

Nothing else in this plan is safe without this. The pin is a characterization test: it records what `computeQuote` does **today** so the refactor in Task 3 cannot silently change it.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/quote/pricing.test.ts`
- Modify: `package.json` (devDependency + `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs Vitest over `src/**/*.test.ts`. The `@/` alias resolves to `src/`.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add the config**

Create `vitest.config.ts`. The manual alias avoids a second dependency (`vite-tsconfig-paths`) for the one path mapping this project has.

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the single "paths" entry in tsconfig.json: "@/*" -> "./src/*".
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // The quote layer is pure TypeScript — no DOM, no React.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add the script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the pin**

Create `src/lib/quote/pricing.test.ts`. Every expected value below was read off the current implementation — do not adjust them to make a later change pass.

```ts
import { describe, expect, it } from "vitest";
import { computeQuote } from "./pricing";
import { DEFAULT_FX } from "./defaults";
import type { QuoteInput } from "./pricing";

/**
 * Characterization test. These numbers are what the calculator produced before
 * the market refactor; they are the contract with every quote already sent.
 * A change here is a regression until proven otherwise — never "update the
 * expected value to match".
 *
 * Fixture: 2 x 40'HC of ginger, Shekou -> Jeddah, at the shipped defaults.
 */
const GULF_FIXTURE: QuoteInput = {
  lines: [
    { id: "farm", label: "Farm price (EXW)", amount: 5.2, currency: "RMB", unit: "per_kg" },
    { id: "packing", label: "Packaging", amount: 1.8, currency: "RMB", unit: "per_carton" },
    { id: "freight", label: "Sea freight", amount: 2400, currency: "USD", unit: "per_container" },
    { id: "customs", label: "Customs & agent fee", amount: 350, currency: "USD", unit: "per_container" },
    { id: "inland", label: "Inland transport", amount: 600, currency: "USD", unit: "per_container" },
    { id: "bank", label: "Bank charges", amount: 45, currency: "USD", unit: "flat" },
  ],
  cargo: {
    productId: "p1",
    containers: 2,
    cartonsPerContainer: 11088,
    nwPerCarton: 2.3,
    gwPerCarton: 2.5,
    loadingPort: "SHEKOU PORT, CHINA",
    dischargePort: "JEDDAH PORT, SAUDI ARABIA",
    etd: "2026-09-15",
  },
  fx: DEFAULT_FX,
  marginPct: 20,
  productSelected: true,
};

describe("computeQuote — Gulf regression pin", () => {
  const q = computeQuote(GULF_FIXTURE);

  it("derives the shipment quantities", () => {
    expect(q.totals.cartons).toBe(22176);
    expect(q.totals.netKg).toBeCloseTo(51004.8, 6);
    expect(q.totals.grossKg).toBe(55440);
    expect(q.totals.qtyMTS).toBeCloseTo(51.0048, 6);
  });

  it("sums the landed cost", () => {
    expect(q.landedCost).toBeCloseTo(51951.18666666666, 8);
    expect(q.costPerMT).toBeCloseTo(1018.5548549678985, 8);
    expect(q.costPerCarton).toBeCloseTo(2.342676166426166, 10);
  });

  it("prices per carton in whole cents", () => {
    expect(q.fobPerCarton).toBe(2.66);
    expect(q.freightPerCarton).toBe(0.22);
    expect(q.cifPerCarton).toBe(2.88);
    expect(q.quotedPerCarton).toBe(2.88);
  });

  it("reconciles the totals against the carton price", () => {
    expect(q.freightUSD).toBe(4800);
    expect(q.fobCost).toBeCloseTo(47151.18666666666, 8);
    expect(q.fobTotal).toBe(58988.16);
    expect(q.quotedTotal).toBe(63866.88);
    expect(q.profit).toBe(11915.69);
  });

  it("derives the per-MT figures for display and contract", () => {
    expect(q.quotedPerMT).toBe(1252);
    expect(q.contractPerMT).toBe(1252.17);
    expect(q.sellPerMT).toBeCloseTo(1273.193568709873, 8);
  });

  it("is ready, with no issues", () => {
    expect(q.issues).toEqual([]);
    expect(q.ready).toBe(true);
  });

  // The property that lets a freight rise be restated without reopening the
  // margin. Task 3 must keep this true for the Gulf market.
  it("keeps CIF - FOB exactly equal to the freight per carton", () => {
    expect(Math.round((q.cifPerCarton - q.fobPerCarton) * 100) / 100).toBe(q.freightPerCarton);
  });
});
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npm test`
Expected: **PASS**, 6 tests. This test passes on first write — that is correct for a characterization pin. If any assertion fails, stop: either the fixture was typed wrong or the code has already drifted. Do not edit the expected values.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/quote/pricing.test.ts
git commit -m "test: pin current Gulf quote output before the market refactor"
```

---

### Task 2: Market profiles

**Files:**
- Create: `src/lib/quote/markets.ts`
- Create: `src/lib/quote/markets.test.ts`
- Modify: `src/types/quote.ts` (add `MarketId`, widen `FIXED_COST_IDS`)
- Modify: `src/lib/quote/defaults.ts` (keep `defaultCostLines` as the Gulf template)

**Interfaces:**
- Consumes: `CostLine`, `CostUnit`, `Currency` from `@/types/quote`; `defaultCostLines()` from `./defaults`.
- Produces:
  - `type MarketId = "gulf" | "russia"`
  - `interface Market` (fields as written below)
  - `const MARKETS: Record<MarketId, Market>`
  - `function marketOf(id: string | undefined): Market` — falls back to `gulf`
  - `const DEFAULT_MARKET: MarketId = "gulf"`

- [ ] **Step 1: Widen the fixed-cost ids**

In `src/types/quote.ts`, replace the `FIXED_COST_IDS` declaration. Keep the existing doc comment above it and append the note below.

```ts
/**
 * Every standing cost id across all markets. The Gulf ships six; the Russian
 * overland route adds `border` (transhipment at Khorgos) and `transit` (the
 * Kazakh per-ton tax). This tuple is the UNION so `isFixedLine()` stays a
 * single global check; which lines a market actually renders, and in what
 * order, comes from that market's `costLines()`.
 */
export const FIXED_COST_IDS = [
  "farm",
  "packing",
  "freight",
  "customs",
  "inland",
  "bank",
  "border",
  "transit",
] as const;
export type FixedCostId = (typeof FIXED_COST_IDS)[number];

/** Which market a quote, cost sheet or pack format belongs to. */
export type MarketId = "gulf" | "russia";
```

- [ ] **Step 2: Widen the quote language**

The Russian profile below declares `langs: ["ru", "en"]`, so `QuoteLang` has to
admit `"ru"` before it will compile. In `src/lib/quote/storage.ts`:

```ts
export type QuoteLang = "en" | "ar" | "ru";

const QUOTE_LANGS: QuoteLang[] = ["en", "ar", "ru"];

export function loadLang(): QuoteLang {
  try {
    const stored = localStorage.getItem(LANG_KEY) as QuoteLang | null;
    return stored && QUOTE_LANGS.includes(stored) ? stored : "en";
  } catch {
    return "en";
  }
}
```

The old `stored === "ar" ? "ar" : "en"` silently coerced anything else to
English, which would have swallowed a stored `"ru"`.

- [ ] **Step 3: Write the failing test**

Create `src/lib/quote/markets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MARKETS, marketOf } from "./markets";
import { defaultCostLines } from "./defaults";

describe("market profiles", () => {
  it("leaves the Gulf profile identical to the shipped defaults", () => {
    // The Gulf profile must be a pure re-expression of current behaviour.
    expect(MARKETS.gulf.costLines()).toEqual(defaultCostLines());
    expect(MARKETS.gulf.usdExpected).toEqual(["freight", "bank"]);
    expect(MARKETS.gulf.markupBase).toBe("goods");
    expect(MARKETS.gulf.priceShape).toBe("two");
    expect(MARKETS.gulf.terms).toEqual({ base: "FOB", delivered: "CIF" });
    expect(MARKETS.gulf.langs).toEqual(["en", "ar"]);
  });

  it("describes the Russian overland route", () => {
    const ru = MARKETS.russia;
    expect(ru.mode).toBe("overland");
    expect(ru.terms).toEqual({ base: "FCA", delivered: "DAP" });
    expect(ru.destinations).toBe("overland");
    expect(ru.priceShape).toBe("delivered");
    expect(ru.markupBase).toBe("landed");
    expect(ru.langs).toEqual(["ru", "en"]);
  });

  it("costs the Russian stack in journey order", () => {
    expect(MARKETS.russia.costLines().map((l) => l.id)).toEqual([
      "farm", "packing", "inland", "border", "freight", "customs", "transit", "bank",
    ]);
  });

  it("quotes Russian freight in RMB and does not warn about it", () => {
    const freight = MARKETS.russia.costLines().find((l) => l.id === "freight");
    expect(freight?.currency).toBe("RMB");
    expect(MARKETS.russia.usdExpected).not.toContain("freight");
    expect(MARKETS.russia.usdExpected).toEqual(["border", "transit", "bank"]);
  });

  it("costs the Russian farm price per MT, not per KG", () => {
    expect(MARKETS.russia.costLines().find((l) => l.id === "farm")?.unit).toBe("per_mt");
  });

  it("falls back to Gulf for an unknown or missing market", () => {
    expect(marketOf(undefined).id).toBe("gulf");
    expect(marketOf("atlantis").id).toBe("gulf");
    expect(marketOf("russia").id).toBe("russia");
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- markets`
Expected: FAIL — `Failed to resolve import "./markets"`.

- [ ] **Step 5: Write the profiles**

Create `src/lib/quote/markets.ts`:

```ts
/**
 * What differs between the markets we sell into.
 *
 * The Gulf ships by sea on FOB/CIF terms to a named port. Russia goes overland
 * — trucked to Khorgos, transhipped across the gauge break, then carried
 * through Kazakhstan — on FCA/DAP terms to a named inland place. That changes
 * the incoterms, the destination vocabulary, the date on the quote, the cost
 * lines, which of them arrive in USD, and the language the offer goes out in.
 *
 * Kept in code rather than a table because a profile carries BEHAVIOUR, not
 * just values: which list the destination picker offers, what the margin is
 * applied to, which caveat sentence prints. `PORTS`, `CURRENCIES`, `UNITS` and
 * `CONTAINER_TYPE` all live as code constants here for the same reason.
 *
 * The `gulf` profile is a pure re-expression of what the calculator did before
 * markets existed. It is pinned by pricing.test.ts and markets.test.ts; if you
 * find yourself editing it, you are changing quotes that have already gone out.
 */

import type { CostLine, MarketId } from "@/types/quote";
import type { QuoteLang } from "./storage";
import { defaultCostLines } from "./defaults";

export interface Market {
  id: MarketId;
  /** Key into the team dictionary's `calc` namespace — never a literal. */
  labelKey: "marketGulf" | "marketRussia";
  mode: "sea" | "overland";
  /** The pair this market quotes on: a base price and a delivered price. */
  terms: { base: string; delivered: string };
  /** Which list the destination picker offers. */
  destinations: "ports" | "overland";
  /**
   * Whether the quote prints both prices or only the delivered one. The Gulf
   * prints two so a freight rise can be restated on its own; Russia reprices
   * weekly in full, so a second figure would only invite confusion.
   */
  priceShape: "two" | "delivered";
  /**
   * What the margin is applied to. "goods" marks up everything except sea
   * freight and passes the freight through at cost, which is what makes
   * CIF − FOB exactly the freight. "landed" marks up the whole landed cost,
   * which is what makes a one-price market's 20% actually mean 20%.
   */
  markupBase: "goods" | "landed";
  /** Offered quote languages, most likely first. */
  langs: QuoteLang[];
  /** The standing cost lines, in the order the team thinks about them. */
  costLines: () => CostLine[];
  /**
   * Lines this market's suppliers invoice in USD. Entering one in RMB divides
   * it by the FX rate and understates the cost, so the sheet flags it. Russian
   * freight is genuinely quoted in RMB and is deliberately absent here.
   */
  usdExpected: readonly string[];
}

export const DEFAULT_MARKET: MarketId = "gulf";

/**
 * The Russian stack, in journey order: farm gate -> packed -> trucked to the
 * border -> transhipped -> carried through Kazakhstan -> cleared -> taxed in
 * transit -> paid.
 *
 * Amounts start at 0 for the same reason the Gulf lines do: a pre-filled fee
 * nobody checked is more dangerous than an obviously empty one. The transit tax
 * is the exception — it is seeded per product from `market_packs`, because it
 * is a published per-ton rate that differs by commodity, not a negotiated cost.
 */
function russianCostLines(): CostLine[] {
  return [
    // Quoted per ton in Russia, unlike the Gulf's per-kg farm price.
    { id: "farm", label: "Farm price (EXW)", amount: 0, currency: "RMB", unit: "per_mt" },
    { id: "packing", label: "Packaging", amount: 0, currency: "RMB", unit: "per_carton" },
    { id: "inland", label: "Inland to Khorgos", amount: 0, currency: "RMB", unit: "per_container" },
    // Split out of the carriage on purpose: the transhipment fee is fixed while
    // the leg beyond it moves, and they go stale at different rates.
    { id: "border", label: "Border transhipment", amount: 0, currency: "USD", unit: "per_container" },
    { id: "freight", label: "Freight Khorgos - destination", amount: 0, currency: "RMB", unit: "per_container" },
    { id: "customs", label: "Customs & agent fee", amount: 0, currency: "RMB", unit: "per_container" },
    { id: "transit", label: "Kazakhstan transit tax", amount: 0, currency: "USD", unit: "per_mt" },
    { id: "bank", label: "Bank charges", amount: 0, currency: "USD", unit: "flat" },
  ];
}

export const MARKETS: Record<MarketId, Market> = {
  gulf: {
    id: "gulf",
    labelKey: "marketGulf",
    mode: "sea",
    terms: { base: "FOB", delivered: "CIF" },
    destinations: "ports",
    priceShape: "two",
    markupBase: "goods",
    langs: ["en", "ar"],
    costLines: defaultCostLines,
    usdExpected: ["freight", "bank"],
  },
  russia: {
    id: "russia",
    labelKey: "marketRussia",
    mode: "overland",
    terms: { base: "FCA", delivered: "DAP" },
    destinations: "overland",
    priceShape: "delivered",
    markupBase: "landed",
    langs: ["ru", "en"],
    costLines: russianCostLines,
    usdExpected: ["border", "transit", "bank"],
  },
};

export const MARKET_IDS = Object.keys(MARKETS) as MarketId[];

/** Any unrecognised value resolves to Gulf — the market every old row is in. */
export function marketOf(id: string | undefined | null): Market {
  return MARKETS[(id ?? "") as MarketId] ?? MARKETS[DEFAULT_MARKET];
}
```

- [ ] **Step 6: Age the two new lines**

In `src/lib/quote/freshness.ts`, add to `STALE_AFTER_DAYS`:

```ts
const STALE_AFTER_DAYS: Record<string, number> = {
  farm: 3,
  freight: 7,
  packing: 30,
  customs: 90,
  inland: 90,
  bank: 90,
  // Both administratively fixed — a transhipment tariff and a published
  // per-ton tax move on their own schedule, not with the market.
  border: 90,
  transit: 90,
};
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — the new `markets` suite plus the Task 1 pin, still green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/quote/markets.ts src/lib/quote/markets.test.ts src/types/quote.ts src/lib/quote/freshness.ts src/lib/quote/storage.ts
git commit -m "feat: describe the Gulf and Russian markets as profiles"
```

---

### Task 3: `markupBase` and a nullable base price

The riskiest change in the plan — it edits the pricing core. Task 1's pin is the guard.

**Files:**
- Modify: `src/lib/quote/pricing.ts`
- Modify: `src/types/quote.ts` (`Quote.fobPerCarton`, `Quote.fobTotal` become nullable)
- Modify: `src/lib/quote/pricing.test.ts` (add the new cases)
- Modify: `src/components/products/quote-calculator/PricePanel.tsx:108,131` (handle null)

**Interfaces:**
- Consumes: `MarketId` and the widened `FIXED_COST_IDS` from Task 2.
- Produces:
  - `QuoteInput` gains `markupBase: "goods" | "landed"`.
  - `Quote.fobPerCarton: number | null` and `Quote.fobTotal: number | null` — null exactly when `markupBase === "landed"`.
  - `Quote.cifPerCarton` remains the delivered price under both bases.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/quote/pricing.test.ts`:

```ts
describe("computeQuote — markup base", () => {
  it("defaults to the Gulf rule when markupBase is 'goods'", () => {
    const q = computeQuote({ ...GULF_FIXTURE, markupBase: "goods" });
    expect(q.cifPerCarton).toBe(2.88);
    expect(q.fobPerCarton).toBe(2.66);
    expect(q.fobTotal).toBe(58988.16);
  });

  it("marks up the whole landed cost when markupBase is 'landed'", () => {
    const q = computeQuote({ ...GULF_FIXTURE, markupBase: "landed" });
    // costPerCarton 2.342676… / 0.8 = 2.9283… -> 2.93
    expect(q.cifPerCarton).toBe(2.93);
    expect(q.quotedPerCarton).toBe(2.93);
    expect(q.quotedTotal).toBe(64975.68);
    expect(q.quotedPerMT).toBe(1274);
    expect(q.contractPerMT).toBe(1273.91);
    expect(q.profit).toBe(13024.49);
  });

  it("returns no base price under 'landed', rather than a misleading one", () => {
    const q = computeQuote({ ...GULF_FIXTURE, markupBase: "landed" });
    expect(q.fobPerCarton).toBeNull();
    expect(q.fobTotal).toBeNull();
  });

  it("still reports the carriage under 'landed', for information", () => {
    const q = computeQuote({ ...GULF_FIXTURE, markupBase: "landed" });
    expect(q.freightUSD).toBe(4800);
    expect(q.freightPerCarton).toBe(0.22);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- pricing`
Expected: FAIL — `markupBase` is not a known property, and `fobPerCarton` is `2.66` not `null`.

- [ ] **Step 3: Make the base price nullable in the type**

In `src/types/quote.ts`, inside `interface Quote`, replace the two fields and extend the block comment:

```ts
  /**
   * The firm base price per carton, in whole cents — FOB for a sea market.
   *
   * NULL when the market quotes one delivered price (`markupBase: "landed"`).
   * Under that base the margin sits on the whole landed cost, so there is no
   * honest "price before carriage" to report, and returning a plausible number
   * would invite a buyer to subtract it from the delivered price and derive a
   * carriage figure that matches no invoice. Nullable so the compiler forces
   * every consumer to say what it does in that case.
   */
  fobPerCarton: number | null;
  fobTotal: number | null;
```

Update the `FOB / CIF` block comment above it to note that the
`cifPerCarton - fobPerCarton === freightPerCarton` identity holds **only** under
`markupBase: "goods"`.

- [ ] **Step 4: Thread the base through the calculation**

In `src/lib/quote/pricing.ts`, add to `QuoteInput`:

```ts
  /**
   * What the margin is applied to — see the Market profile. Optional so every
   * existing caller keeps the Gulf behaviour it was written against.
   */
  markupBase?: "goods" | "landed";
```

Then in `computeQuote`, replace the block from `const fobPerCarton = …` through
`const quotedTotal = …` with:

```ts
  const markupBase = input.markupBase ?? "goods";
  const delivered = markupBase === "landed";

  // "landed": the margin sits on the whole cost, so the delivered price is the
  // marked-up per-carton cost outright and there is no base price to report.
  // "goods": the margin sits on everything but the carriage, which is added at
  // cost — that is what keeps CIF − FOB exactly equal to the freight.
  const fobPerCarton = delivered ? null : roundCents(markUp2(fobCostPerCarton, marginPct));
  const freightPerCarton = roundCents(totals.cartons > 0 ? freightUSD / totals.cartons : 0);
  const cifPerCarton = delivered
    ? roundCents(markUp2(costPerCarton, marginPct))
    : roundCents((fobPerCarton ?? 0) + freightPerCarton);

  const quotedPerCarton = cifPerCarton;
  const quotedTotal = roundCents(cifPerCarton * totals.cartons);
```

And in the returned object replace the `fobTotal` line:

```ts
    fobPerCarton,
    fobTotal: fobPerCarton === null ? null : roundCents(fobPerCarton * totals.cartons),
```

- [ ] **Step 5: Fix the two consumers the compiler will flag**

`PricePanel.tsx` renders the base price at two places. Wrap both in the
`priceShape` check — the panel already receives `quote`, and Task 8 passes it
the market. For now, key off the value itself so this task compiles and ships
on its own:

At `PricePanel.tsx:106-127`, wrap the FOB / freight / CIF box so the first two
rows only render when there is a base price:

```tsx
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/5">
            {quote.fobPerCarton !== null && (
              <>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-slate-600 dark:text-slate-400">{t("fobPerCarton")}</dt>
                  <dd className="font-mono font-semibold tabular-nums">{usd(quote.fobPerCarton)}</dd>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-slate-600 dark:text-slate-400">
                    {t("plusSeaFreight")} <span className="text-xs">{t("atCost")}</span>
                  </dt>
                  <dd className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {usd(quote.freightPerCarton)}
                  </dd>
                </div>
              </>
            )}
            <div
              className={cn(
                "flex items-baseline justify-between gap-3 text-sm",
                quote.fobPerCarton !== null && "mt-1.5 border-t border-foreground/10 pt-1.5"
              )}
            >
              <dt className="font-medium">{t("cifPerCarton")}</dt>
              <dd className="font-mono font-semibold tabular-nums">{usd(quote.cifPerCarton)}</dd>
            </div>
          </div>
```

At `PricePanel.tsx:131-137`, hide the FOB total the same way:

```tsx
            {quote.fobTotal !== null && (
              <div>
                <dt className="text-slate-600 dark:text-slate-400">{t("totalFob")}</dt>
                <dd className="font-mono font-medium tabular-nums">{usd0(quote.fobTotal)}</dd>
              </div>
            )}
```

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all PASS. **The Task 1 pin must still be green** — that is the whole point of this task.

- [ ] **Step 7: Commit**

```bash
git add src/lib/quote/pricing.ts src/lib/quote/pricing.test.ts src/types/quote.ts src/components/products/quote-calculator/PricePanel.tsx
git commit -m "feat: let a market choose what the margin is applied to"
```

---

### Task 4: `market` on the cost sheet

**Files:**
- Create: `supabase/migrations/20260831_120000_cost_sheets_market.sql`
- Modify: `src/types/quote.ts` (`CostSheet.market`)
- Modify: `src/lib/data/cost-sheets.ts`

**Interfaces:**
- Consumes: `MarketId`, `DEFAULT_MARKET` from Task 2.
- Produces:
  - `useCostSheets(productId: string | undefined, market: MarketId)`
  - `useLatestCostSheet(market: MarketId)`
  - `SaveCostSheetInput` gains `market: MarketId`
  - `CostSheet` gains `market: MarketId`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260831_120000_cost_sheets_market.sql`:

```sql
-- Cost sheets belong to a market, not just a product.
--
-- The same product is costed completely differently depending on where it is
-- going: Gulf ginger is 11,088 boxes of 2.3 kg on a ship with USD freight,
-- Russian ginger is 1,440 boxes of 13.6 kg trucked to Khorgos with RMB freight
-- and a Kazakh transit tax. Two live defects follow from the market not being
-- part of the key:
--
--   1. COLLISION. unique (product_id, session_date) means costing ginger for
--      both markets on the same day silently overwrites one with the other.
--   2. CONTAMINATION. useLatestCostSheet() seeds a never-costed product from
--      the most recent sheet of ANY product, so a RMB 47,570 Russian freight
--      would quietly seed the next Gulf quote.
--
-- Defaulting to 'gulf' backfills correctly: every row that exists today is a
-- Gulf sheet, because the Gulf is the only market the calculator has had.
--
-- Wrapped in a transaction so a hand-paste that fails part way leaves the
-- table exactly as it was rather than half-migrated.

begin;

alter table public.product_cost_sheets
  add column if not exists market text not null default 'gulf';

comment on column public.product_cost_sheets.market is
  'Which market this costing is for — see src/lib/quote/markets.ts. '
  'Part of the session key: one sheet per product per market per day.';

alter table public.product_cost_sheets
  drop constraint if exists product_cost_sheets_one_per_day;

alter table public.product_cost_sheets
  add constraint product_cost_sheets_one_per_day
  unique (product_id, market, session_date);

-- Rebuilt on the new key so both hot paths stay indexed: "newest sheet for
-- this product in this market" and the history list beneath it.
drop index if exists idx_product_cost_sheets_product_date;

create index if not exists idx_product_cost_sheets_product_market_date
  on public.product_cost_sheets(product_id, market, session_date desc);

-- Covers "the most recently saved sheet of any product IN THIS MARKET", used
-- to seed a product that has never been costed for it.
create index if not exists idx_product_cost_sheets_market_updated
  on public.product_cost_sheets(market, updated_at desc);

commit;
```

- [ ] **Step 2: Apply it by hand**

Paste the file into the Supabase SQL editor and run it. Confirm with:

```sql
select market, count(*) from public.product_cost_sheets group by market;
```

Expected: every existing row reports `gulf`.

- [ ] **Step 3: Add the field to the type**

In `src/types/quote.ts`, inside `interface CostSheet`, after `productId`:

```ts
  /** Which market this sheet costs for. Older rows are all `gulf`. */
  market: MarketId;
```

- [ ] **Step 4: Thread it through the data layer**

In `src/lib/data/cost-sheets.ts`:

Add `market: string | null;` to `interface DbCostSheet`, and to `dbToLocal`:

```ts
    market: (row.market ?? DEFAULT_MARKET) as MarketId,
```

Import `DEFAULT_MARKET` and the `MarketId` type from `@/lib/quote/markets` and
`@/types/quote` respectively.

Replace `useCostSheets`:

```ts
export function useCostSheets(productId: string | undefined, market: MarketId) {
  useRealtimeCostSheets();
  return useQuery<CostSheet[]>({
    queryKey: ["cost-sheets", productId ?? "", market],
    enabled: Boolean(productId),
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
```

Replace `useLatestCostSheet`:

```ts
/**
 * The most recently saved sheet for any product IN THIS MARKET — used to seed a
 * product that has never been costed, so the team retypes only the farm price.
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
```

Add `market: MarketId;` to `SaveCostSheetInput`, then in `useSaveCostSheet`
put `market: input.market` into `row`, and update all four key sites:

```ts
          const { data, error } = await supabase
            .from("product_cost_sheets")
            .upsert(row as never, { onConflict: "product_id,market,session_date" })
```

```ts
          conflictTarget: "product_id,market,session_date",
          idempotencyKey: `cost-sheet-${input.productId}-${input.market}-${sessionDate}`,
```

```ts
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["cost-sheets", input.productId, input.market] });
      qc.invalidateQueries({ queryKey: ["cost-sheets", "latest-any", input.market] });
    },
```

Missing either of the retry-queue fields means a save queued while offline
replays into the wrong market when the connection returns.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `useQuoteCalculator.ts`, which still calls the old
two-argument signatures. Task 8 fixes those. Confirm no other file is affected.

- [ ] **Step 6: Prove the two markets are isolated**

Spec §11 test 5. There is no Supabase instance in the test run, so this is
verified against the real database rather than in Vitest. In the SQL editor:

```sql
-- Two sheets, same product, same day, different markets. Under the OLD
-- constraint the second insert would have replaced the first.
insert into public.product_cost_sheets (product_id, market, session_date, lines)
select id, 'gulf',   current_date, '[]'::jsonb from public.products limit 1;
insert into public.product_cost_sheets (product_id, market, session_date, lines)
select id, 'russia', current_date, '[]'::jsonb from public.products limit 1;

-- Expect exactly 2 rows, one per market.
select market, count(*) from public.product_cost_sheets
 where session_date = current_date group by market;

-- And the seed query never crosses markets — expect 'gulf' only.
select market from public.product_cost_sheets
 where market = 'gulf' order by updated_at desc limit 1;

-- Clean up.
delete from public.product_cost_sheets
 where session_date = current_date and lines = '[]'::jsonb;
```

Expected: two rows, one `gulf` and one `russia`; the third query returns `gulf`.
A unique-violation on the second insert means the constraint from Step 1 did not
apply — re-run the migration before continuing.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260831_120000_cost_sheets_market.sql src/types/quote.ts src/lib/data/cost-sheets.ts
git commit -m "feat: key cost sheets by market so the two cannot overwrite each other"
```

---

### Task 5: Per-market pack formats on products

**Files:**
- Create: `supabase/migrations/20260831_130000_product_market_packs.sql`
- Create: `src/lib/quote/pack.ts`
- Create: `src/lib/quote/pack.test.ts`
- Modify: `src/types/product.ts`
- Modify: `src/lib/data/products.ts`

**Interfaces:**
- Consumes: `MarketId` from `@/types/quote`; `ProductProfile`.
- Produces:
  - `interface MarketPack { cartons?: number; nw?: number; gw?: number; packUnit?: string; packUnitAr?: string; transitTaxPerMT?: number }`
  - `ProductProfile.marketPacks: Record<string, MarketPack>`
  - `function packFor(product: ProductProfile | undefined, market: MarketId): ResolvedPack`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260831_130000_product_market_packs.sql`:

```sql
-- A product's pack format depends on where it is going.
--
-- Boxes-per-container and the carton weights are properties of the PACK, and
-- the pack changes with the market: Gulf ginger is 11,088 boxes of 2.3 kg,
-- Russian ginger is 1,440 boxes of 13.6 kg. The existing columns can hold one
-- of those, so a second market needs somewhere to live.
--
-- JSONB rather than a child table or a column per market: markets are few, the
-- shape is small and read whole, and every other extensible structure in this
-- schema (cost sheet lines, fx, cargo, contract line_items) is already JSONB.
--
-- The existing default_cartons / default_nw / default_gw / pack_unit columns
-- stay as the DEFAULT pack, which is the Gulf one. Nothing is migrated and no
-- existing row changes: a product with no entry here simply falls through to
-- the columns it already has.
--
-- Shape, keyed by market id:
--   { "russia": { "cartons": 1440, "nw": 13.6, "gw": 14.2,
--                 "packUnit": "carton", "transitTaxPerMT": 250 } }
--
-- transitTaxPerMT is the published Kazakh per-ton rate for this commodity. It
-- seeds the transit cost line so nobody retypes it per quote.

begin;

alter table public.products
  add column if not exists market_packs jsonb not null default '{}'::jsonb;

comment on column public.products.market_packs is
  'Per-market pack format overrides, keyed by market id — see '
  'src/lib/quote/markets.ts. Absent keys fall through to the default '
  '(Gulf) columns on this row.';

-- Known Russian pack formats, from the team's costing sheet. Matched on the
-- exact stored names; anything else keeps an empty object until the team fills
-- it in on the Products page.
--
-- Sanity check — each lands on a plausible overland load:
--   ginger  1,440 x 13.6 kg = 19.58 MT
--   garlic  2,900 x 10.0 kg = 29.00 MT
--   kiwi    2,400 x  9.0 kg = 21.60 MT
update public.products
   set market_packs = market_packs || jsonb_build_object('russia', jsonb_build_object(
         'cartons', 1440, 'nw', 13.6, 'gw', 14.2,
         'packUnit', 'carton', 'transitTaxPerMT', 250))
 where name = 'Fresh Ginger';

update public.products
   set market_packs = market_packs || jsonb_build_object('russia', jsonb_build_object(
         'cartons', 2900, 'nw', 10.0, 'gw', 10.5,
         'packUnit', 'mesh bag', 'transitTaxPerMT', 240))
 where name = 'Fresh Garlic-Mesh';

update public.products
   set market_packs = market_packs || jsonb_build_object('russia', jsonb_build_object(
         'cartons', 2400, 'nw', 9.0, 'gw', 9.5,
         'packUnit', 'carton', 'transitTaxPerMT', 150))
 where name = 'Fresh Kiwi';

commit;
```

> **Note for the team:** the gross weights above (14.2 / 10.5 / 9.5) are taken
> from the ginger row's "14.2kg/box" spec; garlic and kiwi gross weights were
> not in the source sheet and are estimates. Correct them on the Products page.

- [ ] **Step 2: Apply it by hand**

Paste into the Supabase SQL editor. Confirm with:

```sql
select name, market_packs from public.products where market_packs <> '{}'::jsonb;
```

Expected: three rows.

- [ ] **Step 3: Write the failing test**

Create `src/lib/quote/pack.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { packFor } from "./pack";
import type { ProductProfile } from "@/types/product";

const GINGER: ProductProfile = {
  id: "p1",
  name: "Fresh Ginger",
  nameAr: "زنجبيل طازج",
  hsCode: "0910.1100",
  prefix: "GG",
  defaultNW: 2.3,
  defaultGW: 2.5,
  defaultCartons: 11088,
  packUnit: "carton",
  packUnitAr: "كرتون",
  defaultPriceMT: 0,
  containerType: "40'HC",
  notes: "",
  marketPacks: {
    russia: { cartons: 1440, nw: 13.6, gw: 14.2, packUnit: "carton", transitTaxPerMT: 250 },
  },
};

describe("packFor", () => {
  it("uses the product's own columns for the Gulf", () => {
    expect(packFor(GINGER, "gulf")).toEqual({
      cartons: 11088, nw: 2.3, gw: 2.5,
      packUnit: "carton", packUnitAr: "كرتون", transitTaxPerMT: 0,
    });
  });

  it("uses the market pack for Russia", () => {
    expect(packFor(GINGER, "russia")).toEqual({
      cartons: 1440, nw: 13.6, gw: 14.2,
      packUnit: "carton", packUnitAr: "كرتون", transitTaxPerMT: 250,
    });
  });

  it("falls through per field, not all-or-nothing", () => {
    // A market pack that only overrides the box count keeps the product's weights.
    const partial = { ...GINGER, marketPacks: { russia: { cartons: 1440 } } };
    expect(packFor(partial, "russia")).toMatchObject({ cartons: 1440, nw: 2.3, gw: 2.5 });
  });

  it("treats 0 as unset, because the columns are NOT NULL DEFAULT 0", () => {
    const partial = { ...GINGER, marketPacks: { russia: { cartons: 0, nw: 13.6 } } };
    expect(packFor(partial, "russia").cartons).toBe(11088);
  });

  it("falls back to the generic default when the product has no box count", () => {
    const bare = { ...GINGER, defaultCartons: 0, marketPacks: {} };
    expect(packFor(bare, "gulf").cartons).toBe(9700);
  });

  it("survives no product at all", () => {
    expect(packFor(undefined, "russia").cartons).toBe(9700);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -- pack`
Expected: FAIL — `Failed to resolve import "./pack"`.

- [ ] **Step 5: Add the type**

In `src/types/product.ts`, add above `ProductProfile`:

```ts
/**
 * A product's pack format in one market, overriding the row's default columns.
 * Every field is optional and falls through independently — a market that only
 * changes the box count keeps the product's weights.
 */
export interface MarketPack {
  /** Boxes/bags that fill one container in this market. */
  cartons?: number;
  /** Net kg per unit. */
  nw?: number;
  /** Gross kg per unit. */
  gw?: number;
  packUnit?: string;
  packUnitAr?: string;
  /**
   * Published per-ton transit tax for this commodity in this market, in USD.
   * Seeds the `transit` cost line. Russia only; 0 or absent elsewhere.
   */
  transitTaxPerMT?: number;
}
```

And to `ProductProfile`:

```ts
  /**
   * Pack format per market, keyed by market id (products.market_packs). The
   * columns above stay the DEFAULT pack, which is the Gulf one.
   */
  marketPacks: Record<string, MarketPack>;
```

- [ ] **Step 6: Write the resolver**

Create `src/lib/quote/pack.ts`:

```ts
/**
 * Which pack format a product has in a given market.
 *
 * Resolution runs per field, not per object: a market pack that only overrides
 * the box count keeps the product's carton weights. `set()` treats 0 as "not
 * filled in" because the underlying columns are NOT NULL DEFAULT 0 — using `??`
 * would let an unset 0 beat a real value.
 */

import type { MarketPack, ProductProfile } from "@/types/product";
import type { MarketId } from "@/types/quote";
import { DEFAULT_CARTONS } from "./defaults";

export interface ResolvedPack {
  cartons: number;
  nw: number;
  gw: number;
  packUnit: string;
  packUnitAr: string;
  transitTaxPerMT: number;
}

/** A positive number, or undefined when the field is simply not filled in. */
function set(n: number | undefined): number | undefined {
  return typeof n === "number" && n > 0 ? n : undefined;
}

function str(s: string | undefined): string | undefined {
  return s?.trim() ? s : undefined;
}

export function packFor(
  product: ProductProfile | undefined,
  market: MarketId
): ResolvedPack {
  const pack: MarketPack = product?.marketPacks?.[market] ?? {};
  return {
    cartons: set(pack.cartons) ?? set(product?.defaultCartons) ?? DEFAULT_CARTONS,
    nw: set(pack.nw) ?? set(product?.defaultNW) ?? 0,
    gw: set(pack.gw) ?? set(product?.defaultGW) ?? 0,
    packUnit: str(pack.packUnit) ?? str(product?.packUnit) ?? "carton",
    packUnitAr: str(pack.packUnitAr) ?? str(product?.packUnitAr) ?? "كرتون",
    transitTaxPerMT: set(pack.transitTaxPerMT) ?? 0,
  };
}
```

- [ ] **Step 7: Map the column**

In `src/lib/data/products.ts`:

- `interface DbProduct`: add `market_packs: Record<string, MarketPack> | null;`
- `dbToLocal`: add `marketPacks: row.market_packs ?? {},`
- `localToDb`: add `market_packs: p.marketPacks ?? {},`
- `useSaveProduct`'s **explicit update column list**: add `market_packs: row.market_packs,`

That last one is easy to miss — the update branch names every column by hand,
so an omission there means edits silently never persist.

- [ ] **Step 8: Run the tests**

Run: `npm test && npx tsc --noEmit`
Expected: the `pack` suite passes; `tsc` still reports only `useQuoteCalculator.ts` and `ProductManager.tsx` (missing `marketPacks` on literals). Tasks 8 and 9 fix those.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260831_130000_product_market_packs.sql src/lib/quote/pack.ts src/lib/quote/pack.test.ts src/types/product.ts src/lib/data/products.ts
git commit -m "feat: store a pack format per product per market"
```

---

### Task 6: Overland destinations

**Files:**
- Create: `src/lib/places.ts`
- Create: `src/lib/places.test.ts`
- Modify: `src/components/ui/port-combobox.tsx`
- Modify: `src/lib/quote/quote-text.ts` (`quoteTerms`, `placeShortName`)

**Interfaces:**
- Consumes: `Port` and `formatPortValue` from `@/lib/ports`; `Market` from Task 2.
- Produces:
  - `OVERLAND_PLACES: Port[]`
  - `placesFor(market: Market): Port[]`
  - `PortCombobox` gains an optional `places?: Port[]` prop, defaulting to `PORTS`
  - `quoteTerms(market, origin, destination): { base: string; delivered: string }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/places.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { OVERLAND_PLACES, placesFor } from "./places";
import { MARKETS } from "@/lib/quote/markets";
import { PORTS } from "./ports";

describe("overland places", () => {
  it("offers ports to a sea market and inland places to an overland one", () => {
    expect(placesFor(MARKETS.gulf)).toBe(PORTS);
    expect(placesFor(MARKETS.russia)).toBe(OVERLAND_PLACES);
  });

  it("names the border crossing and the Moscow wholesale market", () => {
    const names = OVERLAND_PLACES.map((p) => p.name);
    expect(names).toContain("Khorgos (border)");
    expect(names).toContain("Food City (Moscow)");
    expect(names).toContain("Moscow");
  });

  it("keeps the ports list free of inland places", () => {
    // MasterDataForm renders PORTS; a road destination has no business there.
    expect(PORTS.some((p) => p.name === "Food City (Moscow)")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- places`
Expected: FAIL — `Failed to resolve import "./places"`.

- [ ] **Step 3: Write the list**

Create `src/lib/places.ts`:

```ts
/**
 * Inland destinations for overland markets.
 *
 * Deliberately NOT merged into PORTS. That list is also rendered by
 * MasterDataForm's discharge-port picker, and a road destination offered as a
 * port of discharge on a contract is simply wrong. Same shape as `Port` so
 * formatPortValue and the combobox work unchanged.
 *
 * The Russian trade runs China -> Khorgos (gauge break, transhipment) ->
 * through Kazakhstan -> Russia, so the named place on a DAP quote is a city or
 * a wholesale market, not a berth. Food City is the Moscow agri-food cluster
 * most of this produce actually lands at.
 */

import type { Port } from "./ports";
import { PORTS } from "./ports";
import type { Market } from "@/lib/quote/markets";

export const OVERLAND_PLACES: Port[] = [
  { code: "KZKHO", name: "Khorgos (border)", country: "Kazakhstan", countryCode: "KZ" },
  { code: "KZALA", name: "Almaty", country: "Kazakhstan", countryCode: "KZ" },
  { code: "RUMOWFC", name: "Food City (Moscow)", country: "Russia", countryCode: "RU" },
  { code: "RUMOW", name: "Moscow", country: "Russia", countryCode: "RU" },
  { code: "RUOVB", name: "Novosibirsk", country: "Russia", countryCode: "RU" },
  { code: "RUSVX", name: "Yekaterinburg", country: "Russia", countryCode: "RU" },
];

/** Which destination list this market's pickers offer. */
export function placesFor(market: Market): Port[] {
  return market.destinations === "overland" ? OVERLAND_PLACES : PORTS;
}
```

- [ ] **Step 4: Let the combobox take a list**

In `src/components/ui/port-combobox.tsx`, add to `PortComboboxProps`:

```ts
  /**
   * The list to offer. Defaults to sea ports; an overland market passes its own
   * inland places instead — see lib/places.ts.
   */
  places?: Port[];
```

Destructure it with `places = PORTS`, and change the `filtered` memo to read
`places` rather than the `PORTS` import, adding `places` to its dependency array:

```ts
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return places.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
    );
  }, [search, places]);
```

`MasterDataForm` passes nothing and is unaffected.

- [ ] **Step 5: Write the failing test for the terms**

Create `src/lib/quote/quote-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { quoteTerms } from "./quote-text";
import { MARKETS } from "./markets";

describe("quoteTerms", () => {
  it("shortens sea ports the way an offer writes them", () => {
    expect(quoteTerms(MARKETS.gulf, "SHEKOU PORT, CHINA", "JEDDAH PORT, SAUDI ARABIA"))
      .toEqual({ base: "FOB Shekou", delivered: "CIF Jeddah" });
  });

  it("keeps a berth qualifier that disambiguates the port", () => {
    expect(quoteTerms(MARKETS.gulf, "", "KHALIFA PORT (ABU DHABI), UAE").delivered)
      .toBe("CIF Khalifa Port");
  });

  it("uses overland place names verbatim", () => {
    // portShortName() would strip the parenthetical and leave "DAP Food City",
    // losing the city the buyer is actually being quoted to.
    expect(quoteTerms(MARKETS.russia, "KHORGOS (BORDER), KAZAKHSTAN", "FOOD CITY (MOSCOW), RUSSIA"))
      .toEqual({ base: "FCA Khorgos (border)", delivered: "DAP Food City (Moscow)" });
  });

  it("falls back to the bare term when no place is chosen", () => {
    expect(quoteTerms(MARKETS.russia, "", "")).toEqual({ base: "FCA", delivered: "DAP" });
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- quote-text`
Expected: FAIL — `quoteTerms` currently takes two strings and returns `{ fob, cif }`.

- [ ] **Step 7: Make the terms market-aware**

In `src/lib/quote/quote-text.ts`, replace `quoteTerms` and add `placeShortName`
beside `portShortName` (leave `portShortName` itself untouched — the contract
layer still uses it):

```ts
/**
 * The name a quote prints for a place.
 *
 * Sea ports go through portShortName, which strips the country and the word
 * PORT: "CIF Jeddah" is how the term is written. Overland places are already
 * written as they should be read and are used verbatim — running "FOOD CITY
 * (MOSCOW), RUSSIA" through portShortName would drop the parenthetical and
 * quote "DAP Food City", losing the city entirely.
 */
export function placeShortName(market: Market, stored: string): string {
  if (!stored) return "";
  if (market.destinations !== "overland") return portShortName(stored);
  return titleCase(stored.split(",")[0]);
}

/** "FOB Shekou" / "CIF Jeddah", or "FCA Khorgos (border)" / "DAP Moscow". */
export function quoteTerms(
  market: Market,
  origin: string,
  destination: string
): { base: string; delivered: string } {
  const from = placeShortName(market, origin);
  const to = placeShortName(market, destination);
  return {
    base: from ? `${market.terms.base} ${from}` : market.terms.base,
    delivered: to ? `${market.terms.delivered} ${to}` : market.terms.delivered,
  };
}
```

`titleCase` already lowercases then capitalises each word, so
`"FOOD CITY (MOSCOW)"` becomes `"Food City (Moscow)"`.

Import `Market` from `./markets` at the top of the file.

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: `places` and `quoteTerms` pass. `tsc` will now flag `CargoBar.tsx` and `buildQuoteText`'s internal call — Tasks 7 and 8 fix them.

- [ ] **Step 9: Commit**

```bash
git add src/lib/places.ts src/lib/places.test.ts src/components/ui/port-combobox.tsx src/lib/quote/quote-text.ts src/lib/quote/quote-text.test.ts
git commit -m "feat: name overland destinations without port vocabulary"
```

---

### Task 7: The Russian quote

**Files:**
- Modify: `src/lib/quote/quote-text.ts` (`buildQuoteText`)
- Modify: `src/lib/quote/quote-text.test.ts`

**Interfaces:**
- Consumes: `Market`, `quoteTerms` from Task 6.
- Produces:
  - `QuoteTextInput` gains `market: Market`
  - `buildQuoteText` renders a Russian branch when `lang === "ru"`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/quote/quote-text.test.ts`, adding `buildQuoteText` to the
existing `./quote-text` import rather than writing a second import of the same
module:

```ts
// -> import { buildQuoteText, quoteTerms } from "./quote-text";
import type { Quote } from "@/types/quote";

const RU_QUOTE = {
  totals: { cartons: 1440, netKg: 19584, grossKg: 20448, qtyMTS: 19.584 },
  fobPerCarton: null,
  fobTotal: null,
  freightPerCarton: 4.88,
  cifPerCarton: 34.14,
  quotedPerCarton: 34.14,
  quotedPerMT: 2510,
  quotedTotal: 49161.6,
} as unknown as Quote;

describe("buildQuoteText — Russian", () => {
  const text = buildQuoteText({
    lang: "ru",
    market: MARKETS.russia,
    productName: "Fresh Ginger",
    containers: 1,
    cartonsPerContainer: 1440,
    gwPerCarton: 14.2,
    loadingPort: "KHORGOS (BORDER), KAZAKHSTAN",
    dischargePort: "FOOD CITY (MOSCOW), RUSSIA",
    etd: "2026-09-15",
    packUnit: "carton",
    quote: RU_QUOTE,
  });

  it("prints one delivered price, not two", () => {
    expect(text).toContain("*DAP Food City (Moscow)*");
    expect(text).not.toContain("FCA");
    expect(text).not.toContain("FOB");
    expect(text).not.toContain("CIF");
  });

  it("restates the price per ton", () => {
    expect(text).toContain("$2,510");
  });

  it("carries no sea vocabulary", () => {
    expect(text).not.toMatch(/sea|vessel|sailing|ETD/i);
    expect(text).not.toMatch(/морск|судн/i);
  });

  it("keeps the product emoji and the brand", () => {
    expect(text).toContain("🫚");
    expect(text).toContain("NAWA FRESH");
  });

  it("never leaks Chinese into buyer output", () => {
    expect(text).not.toMatch(/[一-鿿]/);
  });
});

describe("buildQuoteText — Gulf is unchanged", () => {
  it("still prints both prices in English", () => {
    const text = buildQuoteText({
      lang: "en",
      market: MARKETS.gulf,
      productName: "Fresh Ginger",
      containers: 2,
      cartonsPerContainer: 11088,
      gwPerCarton: 2.5,
      loadingPort: "SHEKOU PORT, CHINA",
      dischargePort: "JEDDAH PORT, SAUDI ARABIA",
      etd: "2026-09-15",
      packUnit: "carton",
      quote: { ...RU_QUOTE, fobPerCarton: 2.66, fobTotal: 58988.16 } as unknown as Quote,
    });
    expect(text).toContain("*FOB Shekou*");
    expect(text).toContain("*CIF Jeddah*");
    expect(text).toContain("ETD:");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- quote-text`
Expected: FAIL — `lang: "ru"` is not assignable, and `market` is not a known property.

- [ ] **Step 3: Add the Russian branch**

(`QuoteLang` already admits `"ru"` — Task 2 Step 2 widened it.)

In `src/lib/quote/quote-text.ts`:

Add `market: Market;` to `QuoteTextInput`, and a Russian product-name fallback
beside `arabicProductName`:

```ts
/**
 * Russian product names for rows added before the products table carried one.
 * Keyed on the English name, which every product has.
 */
const RU_PRODUCT: Record<string, string> = {
  "Fresh Garlic": "Чеснок свежий",
  "Fresh Ginger": "Имбирь свежий",
  "Fresh Kiwi": "Киви свежий",
  "Fresh Apple": "Яблоко свежее",
  "Fresh Onion": "Лук свежий",
  "Fresh Lemon": "Лимон свежий",
  "FRESH CARROTS": "Морковь свежая",
};

/** Matches on a substring so "Fresh Garlic-Mesh" resolves like "Fresh Garlic". */
export function russianProductName(name: string): string {
  const hit = Object.keys(RU_PRODUCT).find((k) => name.toLowerCase().includes(k.toLowerCase()));
  return hit ? RU_PRODUCT[hit] : name;
}
```

Change the existing `const { fob: fobTerm, cif: cifTerm } = quoteTerms(...)` line to:

```ts
  const { base: baseTerm, delivered: deliveredTerm } = quoteTerms(
    input.market,
    input.loadingPort,
    input.dischargePort
  );
```

and rename `fobTerm` -> `baseTerm`, `cifTerm` -> `deliveredTerm` in the English
and Arabic branches. Then insert the Russian branch before the English return:

```ts
  if (input.lang === "ru") {
    const product = russianProductName(productName);
    return [
      `*${BRAND}* — Коммерческое предложение`,
      "",
      `${emoji}*${product}*`,
      // One delivered price: the whole quote is repriced weekly, so a second
      // figure would read as a competing offer rather than the same one
      // restated. Container count matters to the buyer; the type does not.
      `${containers} × ${CONTAINER_TYPE} · ${cartons} ${RU_UNIT}`,
      `${qty(gwPerCarton, 1)} кг брутто за ${RU_UNIT_GEN}`,
      `Отгрузка: ${formatEtd(input.etd)}`,
      "",
      `*${deliveredTerm}* ${usd(quote.cifPerCarton)}/${RU_UNIT_GEN}`,
      `= ${usd0(quote.quotedPerMT)} за тонну`,
      `*Итого* ${usd0(quote.quotedTotal)} (${deliveredTerm})`,
      "",
      `Стоимость перевозки меняется — цена подтверждается при бронировании. Предложение действительно ${QUOTE_VALID_DAYS} дней.`,
      "",
      WEBSITE,
    ].join("\n");
  }
```

with these constants beside `BRAND_AR`:

```ts
/**
 * Russian counts take the genitive plural after any number above four, which is
 * the only range these box counts hit — so one form each is enough.
 * "коробка" (nominative) for the count, "коробку" after "за".
 */
const RU_UNIT = "коробок";
const RU_UNIT_GEN = "коробку";
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — including the "Gulf is unchanged" case.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quote/quote-text.ts src/lib/quote/quote-text.test.ts
git commit -m "feat: quote the Russian market in Russian"
```

> **Flag for the team:** the Russian copy above needs a native reader's check
> before it goes to a buyer, and `pack_unit` is not yet translated per product —
> a garlic offer will say "коробок" where it should say "сеток". Raise both.

---

### Task 8: Wire the market into the calculator

The largest task. It ends with a working Russian quote on screen.

**Files:**
- Modify: `src/lib/team-i18n/dictionary.ts` (new keys, `en` + `zh`)
- Modify: `src/components/products/quote-calculator/useQuoteCalculator.ts`
- Modify: `src/components/products/quote-calculator/CargoBar.tsx`
- Modify: `src/components/products/quote-calculator/CostSheet.tsx`
- Modify: `src/components/products/quote-calculator/PricePanel.tsx`
- Modify: `src/components/products/quote-calculator/QuoteCalculator.tsx`
- Modify: `src/components/products/quote-calculator/PriceOfferPDF.tsx`, `PriceOfferDownload.tsx`

**Interfaces:**
- Consumes: `MARKETS`, `marketOf`, `MARKET_IDS` (Task 2); `packFor` (Task 5); `placesFor` (Task 6); `quoteTerms` (Task 6); `useCostSheets(productId, market)`, `useLatestCostSheet(market)` (Task 4).
- Produces: `useQuoteCalculator()` returns `market: Market` and `setMarket(id: MarketId)`; all panels take `market`.

- [ ] **Step 1: Add the strings**

In `src/lib/team-i18n/dictionary.ts`, add to `en.calc`. The `zh` object is typed
against `en`, so add the same keys there or the build fails.

```ts
    market: "Market",
    marketA11y: "Market this quote is for",
    marketGulf: "Gulf (sea)",
    marketRussia: "Russia (overland)",
    // Overland variants of the sea-specific labels.
    originPlace: "Origin (FCA)",
    originPlaceA11y: "Origin place for FCA",
    originPlaceSearch: "Search origin places…",
    destPlace: "Destination (DAP)",
    destPlaceA11y: "Destination place for DAP",
    destPlaceSearch: "Search destinations…",
    dispatch: "Dispatch date",
    dispatchA11y: "Date the cargo leaves the factory",
    deliveredPricePerMt: "DAP price per MT",
    deliveredPerCarton: "DAP / carton",
    totalDelivered: "Total DAP",
    langRu: "Русский",
```

Chinese:

```ts
    market: "市场",
    marketA11y: "本报价所属市场",
    marketGulf: "海湾（海运）",
    marketRussia: "俄罗斯（陆运）",
    originPlace: "起运地 (FCA)",
    originPlaceA11y: "FCA 起运地",
    originPlaceSearch: "搜索起运地…",
    destPlace: "目的地 (DAP)",
    destPlaceA11y: "DAP 目的地",
    destPlaceSearch: "搜索目的地…",
    dispatch: "发货日期",
    dispatchA11y: "货物离厂日期",
    deliveredPricePerMt: "DAP 每吨价格",
    deliveredPerCarton: "DAP / 箱",
    totalDelivered: "DAP 总额",
    langRu: "Русский",
```

- [ ] **Step 2: Hold the market in the hook**

In `useQuoteCalculator.ts`:

Add the state, above `productChoice`:

```ts
  const [marketId, setMarketId] = useState<MarketId>(DEFAULT_MARKET);
  const market = useMemo(() => marketOf(marketId), [marketId]);
```

Pass it to both queries:

```ts
  const { data: sheetsData, isLoading: sheetsLoading } = useCostSheets(productId || undefined, marketId);
  const { data: latestAnySheet, isLoading: latestLoading } = useLatestCostSheet(marketId);
```

Seed from the market's own template — change `seedSheet` to take the market and
use `market.costLines()` in place of `defaultCostLines()`, and to seed the
transit tax from the product's pack:

```ts
function seedSheet(
  productId: string,
  market: Market,
  transitTaxPerMT: number,
  own: CostSheet | undefined,
  latestAny: CostSheet | null
): WorkingSheet {
  if (own) {
    return { productId, lines: own.lines, fx: own.fx, marginPct: own.marginPct, origin: "saved" };
  }
  if (latestAny) {
    return {
      productId,
      // Carry the cost structure across but not the farm price — that is
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
  const legacy = market.id === "gulf" ? legacyLocalSheet() : null;
  if (legacy) {
    return { productId, lines: legacy.lines, fx: legacy.fx, marginPct: legacy.marginPct, origin: "copied" };
  }
  return {
    productId,
    lines: market.costLines().map((l) =>
      l.id === "transit" ? { ...l, amount: transitTaxPerMT } : l
    ),
    fx: { ...DEFAULT_FX },
    marginPct: DEFAULT_MARGIN,
    origin: "blank",
  };
}
```

The legacy localStorage seed is Gulf-only: those saved fees were sea costs, and
handing them to a Russian sheet would be the contamination this plan removes.

The `sheet` memo becomes market-keyed so switching market re-seeds:

```ts
  const pack = useMemo(() => packFor(product, marketId), [product, marketId]);

  const sheet: WorkingSheet = useMemo(() => {
    if (working?.productId === productId && working.market === marketId) return working;
    return seedSheet(productId, market, pack.transitTaxPerMT, savedSheet, latestAnySheet ?? null);
  }, [working, productId, marketId, market, pack.transitTaxPerMT, savedSheet, latestAnySheet]);
```

Add `market: MarketId` to `interface WorkingSheet`, set it in `seedSheet`'s three
returns, and include it in `edit`'s spread (`market: marketId`).

In the `cargo` memo, replace the three pack lookups with `pack`:

```ts
      cartonsPerContainer:
        ownedCartons?.cartons ?? set(pack.cartons) ?? set(savedCargo.cartonsPerContainer) ?? DEFAULT_CARTONS,
      nwPerCarton: owned?.nw ?? set(pack.nw) ?? set(savedCargo.nwPerCarton) ?? 0,
      gwPerCarton: owned?.gw ?? set(pack.gw) ?? set(savedCargo.gwPerCarton) ?? 0,
      loadingPort: route?.loadingPort ?? savedCargo.loadingPort ?? fallbackRoute.loadingPort,
      dischargePort: route?.dischargePort ?? savedCargo.dischargePort ?? fallbackRoute.dischargePort,
```

`packFor` already applies the generic fallback, so the trailing `?? DEFAULT_CARTONS`
is belt-and-braces; keep it.

Pass the markup base into both `computeQuote` calls:

```ts
        markupBase: market.markupBase,
```

Pass the market to the save:

```ts
        saveSheet.mutate({
          productId: p.sheet.productId,
          market: p.sheet.market,
          ...
```

Add a setter and return the new values:

```ts
  const setMarket = useCallback((next: MarketId) => {
    setMarketId(next);
    // The route belongs to the market: a Gulf port on a Russian quote, or the
    // reverse, is a factual error on a client-facing offer.
    setRoute(null);
    setWorking(null);
  }, []);
```

```ts
    market,
    setMarket,
    pack,
```

Finally, clamp the language when the market changes — a Russian quote must not
stay stuck on Arabic:

```ts
  const lang = market.langs.includes(langState.lang) ? langState.lang : market.langs[0];
```

and return that `lang` instead of `langState.lang`.

- [ ] **Step 3: Put the market on the toolbar**

In `CargoBar.tsx`, add `market: Market` and `onMarketChange: (id: MarketId) => void`
to `Props`, and a first control in the top grid — before the product select, since
the market decides which pack the product even has:

```tsx
        <label className="block">
          <FieldLabel>{t("market")}</FieldLabel>
          <Select value={market.id} onValueChange={(v) => v && onMarketChange(v as MarketId)}>
            <SelectTrigger className="h-9 w-full bg-white text-sm font-medium dark:bg-zinc-800/60">
              <SelectValue>{t(market.labelKey)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MARKET_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {t(MARKETS[id].labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
```

Widen the grid template by one column: `lg:grid-cols-[minmax(9rem,1fr)_minmax(11rem,1.4fr)_repeat(4,minmax(0,1fr))]`.

Make the route row market-aware:

```tsx
  const overland = market.mode === "overland";
  const terms = quoteTerms(market, cargo.loadingPort, cargo.dischargePort);
  const places = placesFor(market);
```

```tsx
          <FieldLabel>{overland ? t("originPlace") : t("loadingPort")}</FieldLabel>
          <PortCombobox
            value={cargo.loadingPort}
            places={places}
            onChange={(loadingPort) => onChange({ loadingPort })}
            ariaLabel={overland ? t("originPlaceA11y") : t("loadingPortA11y")}
            placeholder={overland ? t("originPlaceSearch") : t("loadingPortSearch")}
          />
```

Mirror that for the destination (`destPlace` / `dischargePort`), and for the
date label use `overland ? t("dispatch") : t("etd")` with the matching a11y key.

In the summary row, `{terms.fob} / {terms.cif}` becomes
`{terms.base} / {terms.delivered}`.

- [ ] **Step 4: Make the USD warning market-aware**

In `CostSheet.tsx`, replace the `USD_EXPECTED_LINES` import with a `market: Market`
prop threaded down to the row component, and change line 246 to:

```tsx
        {market.usdExpected.includes(line.id) && line.currency !== "USD" && (
```

Russian freight arrives in RMB by design; the old global list would have flagged
an error on every Russian quote.

- [ ] **Step 5: Branch the price panel**

In `PricePanel.tsx`, take a `market: Market` prop and use it for the labels and
the language buttons:

```tsx
  const delivered = market.priceShape === "delivered";
```

```tsx
          <dt className="text-sm text-slate-600 dark:text-slate-400">
            {delivered ? t("deliveredPricePerMt") : t("cifPricePerMt")}
          </dt>
```

```tsx
              <dt className="font-medium">{delivered ? t("deliveredPerCarton") : t("cifPerCarton")}</dt>
```

```tsx
              <dt className="text-slate-600 dark:text-slate-400">
                {delivered ? t("totalDelivered") : t("totalCif")}
              </dt>
```

Replace the hardcoded language pair at line 288:

```tsx
            {market.langs.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onLangChange(code)}
                aria-pressed={lang === code}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none",
                  lang === code
                    ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-600 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                {LANG_LABEL[code](t)}
              </button>
            ))}
```

with, near the top of the file:

```ts
/** Quote-language button labels, each written in its own script. */
const LANG_LABEL: Record<QuoteLang, (t: ReturnType<typeof useT<"calc">>) => string> = {
  en: (t) => t("langEn"),
  ar: (t) => t("langAr"),
  ru: (t) => t("langRu"),
};
```

Hide the riyal block on non-Gulf markets — a SAR conversion on a Russian quote is
noise. Wrap the existing `sarPerCarton !== null && sarTotal !== null` condition
as `market.id === "gulf" && sarPerCarton !== null && sarTotal !== null`.

- [ ] **Step 6: Pass the market down**

In `QuoteCalculator.tsx`, thread `calc.market` into `CargoBar`, `CostSheet`,
`PricePanel`, and into `buildQuoteText`:

```ts
    return buildQuoteText({
      lang,
      market: calc.market,
      productName: product.name,
      ...
      packUnit: calc.pack.packUnit,
      packUnitAr: calc.pack.packUnitAr,
      quote,
    });
```

Note `packUnit` now comes from the resolved pack, not `product.packUnit` — that
is what makes a Russian garlic offer say the Russian pack's unit. Do the same for
`PriceOfferDownload`'s `packUnit` prop, and pass `market` to it.

In `PriceOfferPDF.tsx`, replace the `quoteTerms(data.loadingPort, data.dischargePort)`
call with the market-aware one, take `market` on `PriceOfferData`, use
`terms.base` / `terms.delivered`, and render the base price row only when
`data.quote.fobPerCarton !== null`. The PDF stays English — that is the existing
behaviour for Arabic and is deliberate.

- [ ] **Step 7: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all PASS, zero type errors across the repo.

- [ ] **Step 8: Check it in the browser**

Run: `npm run dev`, open `/products/calculator`.

1. Market defaults to **Gulf**. Quote a product — the numbers match what the page produced before this branch.
2. Switch to **Russia**. Confirm: box count and weights change to the Russian pack; the cost sheet shows eight lines with `Kazakhstan transit tax` pre-filled; freight in RMB draws **no** "should be USD" warning; the route pickers offer Khorgos / Food City / Moscow and not Jeddah; the date reads "Dispatch date"; the price panel shows one DAP price with no FOB row; the language buttons are Русский / English.
3. Switch back to **Gulf**. The Gulf sheet is intact and unaffected by anything typed on the Russian one.

- [ ] **Step 9: Commit**

```bash
git add src/lib/team-i18n/dictionary.ts src/components/products/quote-calculator/
git commit -m "feat: pick a market on the calculator and quote it correctly"
```

---

### Task 9: Edit the Russian pack on the Products page

**Files:**
- Modify: `src/components/products/ProductManager.tsx`
- Modify: `src/lib/team-i18n/dictionary.ts`

**Interfaces:**
- Consumes: `MarketPack` (Task 5), `MARKETS` (Task 2).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the strings**

`en.products`:

```ts
    russianPack: "Russian pack",
    russianPackHint: "Leave blank to use the default pack above.",
    fTaxPerMT: "Transit tax $/MT",
    fTaxPerMTPlaceholder: "e.g. 250",
```

`zh.products`:

```ts
    russianPack: "俄罗斯包装",
    russianPackHint: "留空则使用上方默认包装。",
    fTaxPerMT: "过境税 美元/吨",
    fTaxPerMTPlaceholder: "例如 250",
```

- [ ] **Step 2: Seed the field on a new product**

At `ProductManager.tsx:117`, the blank-product literal now needs the field:

```ts
      defaultNW: 0, defaultGW: 0, defaultCartons: 0, packUnit: "carton", packUnitAr: "كرتون",
      marketPacks: {},
```

- [ ] **Step 3: Add the section**

Below the existing pack fields in the edit form, add a bordered section. A small
helper keeps each input to one line:

```tsx
  const ruPack = editing.marketPacks?.russia ?? {};
  const setRu = (patch: Partial<MarketPack>) =>
    setEditing({
      ...editing,
      marketPacks: { ...editing.marketPacks, russia: { ...ruPack, ...patch } },
    });
```

```tsx
          <div className="col-span-full mt-2 rounded-lg border border-slate-200 p-3 dark:border-white/10">
            <div className="mb-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {t("russianPack")}
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("russianPackHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div>
                <Label className="mb-1.5 block text-xs">{t("fBoxes")}</Label>
                <Input type="number" value={ruPack.cartons || ""} placeholder={t("fBoxesPlaceholder")}
                  onChange={(e) => setRu({ cartons: parseInt(e.target.value) || 0 })}
                  className="h-10 bg-white font-mono dark:bg-zinc-800" />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">{t("fNW")}</Label>
                <Input type="number" step="0.1" value={ruPack.nw || ""}
                  onChange={(e) => setRu({ nw: parseFloat(e.target.value) || 0 })}
                  className="h-10 bg-white font-mono dark:bg-zinc-800" />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">{t("fGW")}</Label>
                <Input type="number" step="0.1" value={ruPack.gw || ""}
                  onChange={(e) => setRu({ gw: parseFloat(e.target.value) || 0 })}
                  className="h-10 bg-white font-mono dark:bg-zinc-800" />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">{t("fUnit")}</Label>
                <Input value={ruPack.packUnit ?? ""} placeholder={t("fUnitPlaceholder")}
                  onChange={(e) => setRu({ packUnit: e.target.value })}
                  className="h-10 bg-white font-medium dark:bg-zinc-800" />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">{t("fTaxPerMT")}</Label>
                <Input type="number" value={ruPack.transitTaxPerMT || ""} placeholder={t("fTaxPerMTPlaceholder")}
                  onChange={(e) => setRu({ transitTaxPerMT: parseFloat(e.target.value) || 0 })}
                  className="h-10 bg-white font-mono dark:bg-zinc-800" />
              </div>
            </div>
          </div>
```

Check the exact key names `fNW` / `fGW` against the `products` namespace in the
dictionary and use whatever is already there rather than adding duplicates.

- [ ] **Step 4: Verify in the browser**

Run `npm run dev`, open `/products`. Edit Fresh Ginger: the Russian pack shows
1440 / 13.6 / 14.2 / carton / 250 from the migration. Change the box count, save,
reload — it persists. Open the calculator on the Russian market and confirm the
new figure is what it quotes.

That round trip is the real test of Task 5 Step 7: if `market_packs` was left out
of `useSaveProduct`'s explicit update list, the value silently reverts here.

- [ ] **Step 5: Commit**

```bash
git add src/components/products/ProductManager.tsx src/lib/team-i18n/dictionary.ts
git commit -m "feat: edit a product's Russian pack format"
```

---

### Task 10: Hand the right incoterm to Master Data

**Files:**
- Modify: `src/lib/quote/master-draft.ts`
- Modify: `src/components/products/quote-calculator/QuoteCalculator.tsx`

**Interfaces:**
- Consumes: `Market`, `placeShortName` (Task 6).
- Produces: `MasterDraftInput` gains `market: Market`.

- [ ] **Step 1: Take the term from the market**

`sendToMasterData` currently keeps whatever term the existing draft had and only
replaces the place, so a Russian quote would hand a contract still reading CIF.

Add `market: Market;` to `MasterDraftInput`, and replace the `incoterm` line:

```ts
      // The quote was made on this market's delivered term to this place, so
      // the contract names both. Taking the term from the draft (as this once
      // did) meant a Russian DAP quote handed over a contract still saying CIF.
      incoterm: input.dischargePort
        ? joinIncoterm(
            input.market.terms.delivered,
            placeShortName(input.market, input.dischargePort).toUpperCase()
          )
        : joinIncoterm(input.market.terms.delivered, splitIncoterm(base.shipping.incoterm).place),
```

Swap the `portShortName` import for `placeShortName`.

- [ ] **Step 2: Pass it in**

In `QuoteCalculator.tsx`'s `handleSendToMaster`, add `market: calc.market,` to the
`sendToMasterData` call.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

In the browser: quote on the Russian market, click *Send to Master Data*, open
`/master`. The incoterm reads `DAP FOOD CITY (MOSCOW)`, not `CIF …`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/quote/master-draft.ts src/components/products/quote-calculator/QuoteCalculator.tsx
git commit -m "fix: carry the market's incoterm into the contract draft"
```

---

### Task 11: Reproduce the team's costing sheet

The end-to-end check that the Russian cost stack maps correctly.

**Files:**
- Modify: `src/lib/quote/pricing.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Append to `src/lib/quote/pricing.test.ts`, putting the new import up with the
others at the top of the file:

```ts
// at the top, beside the existing imports:
import { MARKETS } from "./markets";

/**
 * The team's Russian costing sheet, run through the calculator at zero margin.
 *
 * These figures deliberately DO NOT match the spreadsheet:
 *
 *  - Garlic and kiwi are far off because the sheet's Total column stops after
 *    freight on those two rows, silently dropping customs and the transit tax.
 *  - Ginger — the one row summed correctly — still lands three cents high,
 *    because the sheet converts the transit tax at ¥6.70 and everything else at
 *    ¥6.77. The calculator holds one FX table per sheet, and the tax is entered
 *    in USD per MT so it never passes through FX at all.
 *
 * Matching the spreadsheet exactly would mean reproducing its bugs.
 */
const RU_FX = { RMB: 6.77, EUR: 0.92, SAR: 3.75, AED: 3.67, KWD: 0.31 };

function russianSheet(exwPerMT: number, inland: number, taxPerMT: number) {
  return MARKETS.russia.costLines().map((l) => {
    if (l.id === "farm") return { ...l, amount: exwPerMT };
    if (l.id === "inland") return { ...l, amount: inland };
    // The ~$500 transhipment stays inside the carriage for this fixture, as it
    // does in the source sheet. Splitting it out must not move the total.
    if (l.id === "freight") return { ...l, amount: 47570 };
    if (l.id === "customs") return { ...l, amount: 5000 };
    if (l.id === "transit") return { ...l, amount: taxPerMT };
    return l;
  });
}

describe.each([
  { name: "ginger", cartons: 1440, nw: 13.6, gw: 14.2, exw: 8300, inland: 18000, tax: 250, mt: 19.584, landed: 39329.8552, perBox: 27.3124 },
  { name: "garlic", cartons: 2900, nw: 10.0, gw: 10.5, exw: 8300, inland: 18000, tax: 240, mt: 29.0, landed: 52937.8434, perBox: 18.2544 },
  { name: "kiwi", cartons: 2400, nw: 9.0, gw: 9.5, exw: 6200, inland: 15000, tax: 150, mt: 21.6, landed: 33002.1861, perBox: 13.7509 },
])("Russian cost stack — $name", (c) => {
  const q = computeQuote({
    lines: russianSheet(c.exw, c.inland, c.tax),
    cargo: {
      productId: "p", containers: 1, cartonsPerContainer: c.cartons,
      nwPerCarton: c.nw, gwPerCarton: c.gw,
      loadingPort: "KHORGOS (BORDER), KAZAKHSTAN",
      dischargePort: "FOOD CITY (MOSCOW), RUSSIA",
      etd: "2026-09-15",
    },
    fx: RU_FX,
    marginPct: 0,
    productSelected: true,
    markupBase: MARKETS.russia.markupBase,
  });

  it("lands on the corrected quantity and cost", () => {
    expect(q.totals.qtyMTS).toBeCloseTo(c.mt, 6);
    expect(q.landedCost).toBeCloseTo(c.landed, 3);
    expect(q.costPerCarton).toBeCloseTo(c.perBox, 4);
  });

  it("quotes no base price on a delivered market", () => {
    expect(q.fobPerCarton).toBeNull();
    expect(q.fobTotal).toBeNull();
  });

  it("raises no error — the stack is complete", () => {
    expect(q.issues.filter((i) => i.level === "error")).toEqual([]);
  });
});

it("is unmoved by splitting the transhipment fee out of the carriage", () => {
  const base = { containers: 1, cartonsPerContainer: 1440, nwPerCarton: 13.6, gwPerCarton: 14.2,
    productId: "p", loadingPort: "", dischargePort: "", etd: "2026-09-15" };
  const whole = computeQuote({
    lines: russianSheet(8300, 18000, 250),
    cargo: base, fx: RU_FX, marginPct: 0, productSelected: true, markupBase: "landed",
  });
  const split = computeQuote({
    lines: russianSheet(8300, 18000, 250).map((l) =>
      // $500 at 6.77 is ¥3,385 — taken off the carriage, added back as USD.
      l.id === "freight" ? { ...l, amount: 47570 - 3385 } : l.id === "border" ? { ...l, amount: 500 } : l
    ),
    cargo: base, fx: RU_FX, marginPct: 0, productSelected: true, markupBase: "landed",
  });
  expect(split.landedCost).toBeCloseTo(whole.landedCost, 6);
});
```

- [ ] **Step 2: Run it**

Run: `npm test`
Expected: PASS. If a row is off, the cost stack in `markets.ts` does not match
the spec's §2 table — fix the profile, not the expected value.

- [ ] **Step 3: Full check**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/quote/pricing.test.ts
git commit -m "test: reproduce the team's Russian costing sheet, corrected"
```

---

## Follow-ups for the team

Not blocking, but raise them:

1. **The Russian copy needs a native reader.** Task 7 drafts it; nobody on the build side can sign it off.
2. **`packUnit` has no Russian translation.** A garlic offer will read "коробок" where it should read "сеток". Either add `packUnitRu` to `MarketPack` or accept the English-derived word for now.
3. **The garlic and kiwi gross weights** seeded in Task 5's migration are estimates — only ginger's 14.2 kg came from the source sheet.
4. **The two spreadsheet defects** the spec records are still live in the team's own file. Whoever maintains it should fix the SUM ranges on rows 2 and 3 and settle on one FX rate.
5. **Master Data's port picker** still offers sea ports only, so a Russian destination handed over displays but cannot be re-picked. Worth doing if Russian contracts become routine.
