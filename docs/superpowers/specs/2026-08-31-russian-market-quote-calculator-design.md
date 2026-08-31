# Russian market in the Quote Calculator

**Date:** 2026-08-31
**Status:** Design approved, ready for implementation planning

## Problem

The team sells the same products into different markets, and each market has its
own pack format. The calculator models a pack format as a property of the
*product* (`default_cartons`, `default_nw`, `default_gw`, `pack_unit`), so today
a product can hold exactly one. Ginger for the Gulf is 11,088 boxes of 2.3 kg;
ginger for Russia is 1,440 boxes of 13.6 kg. Both cannot be true at once.

Packaging turned out to be the smallest of four differences. The Russian trade
also runs a different route, a different cost stack and a different language:

| | Gulf | Russia |
|---|---|---|
| Transport | Sea, China → Gulf ports | Overland, China → Khorgos → Kazakhstan → Russia |
| Terms | FOB / CIF, named ports | FCA / DAP, named inland places |
| Date on quote | Vessel ETD | Dispatch date |
| Cost stack | 6 lines, freight in USD | 8 lines, freight in RMB, plus a Kazakh transit tax per MT |
| Quote language | English, Arabic | Russian |
| Price shape | Two prices (FOB firm + CIF) | One delivered price |

## What the source spreadsheet showed

The team's working sheet prices three products for Russia — ginger (Rita),
garlic (Du), kiwi (Zhao) — each with its own pack format, in RMB, converted to
USD at the end. Two defects in it motivated parts of this design.

**1. The Total column is inconsistent.** Row 1 sums all five cost columns; rows
2 and 3 stop after freight, silently dropping customs and the transit tax.

| | Total ¥ stated | Sums | Omitted | True total |
|---|---|---|---|---|
| Ginger | ¥265,920 | EXW + shipping + freight + customs + tax | — | ¥265,920 |
| Garlic | ¥306,270 | EXW + shipping + freight | ¥5,000 + ¥46,632 | ¥357,902 |
| Kiwi | ¥196,490 | EXW + shipping + freight | ¥5,000 + ¥21,708 | ¥223,198 |

Restated at the sheet's own ¥6.77: garlic $15.60/box → **$18.23**, $1,560/T →
**$1,823/T**; kiwi $12.09/box → **$13.74**, $1,344/T → **$1,526/T**. The ranking
between suppliers survives, but the two cheap-looking rows are ~17% and ~14%
light. A cost sheet that sums its own lines cannot have this defect.

**2. Two exchange rates in one sheet.** The transit tax is entered in USD per
ton and converted into the sheet at **¥6.70** — exactly, for all three rows
($250 × 19.584 × 6.70 = ¥32,803; $240 × 29 × 6.70 = ¥46,632; $150 × 21.6 ×
6.70 = ¥21,708) — while the final USD price converts back at **¥6.77**. The
calculator stores one FX table per sheet and converts every line through it, so
this class of drift cannot occur.

## Decisions taken during brainstorming

| Question | Answer |
|---|---|
| Compare suppliers, or quote? | Quote. The three rows are three *products*, not three suppliers. |
| One offer or several? | Three separate offers — one product per quote, as today. |
| Margin? | Same as the Gulf calculator: the existing slider and markup formula. |
| Route? | Overland. ¥18,000 is factory → Khorgos; ¥47,570 is ~$500 border transhipment plus Khorgos → Russia. |
| The per-ton tax? | Paid in Kazakhstan. A real cost we bear. |
| Destinations? | Moscow (incl. Food City), Novosibirsk. |
| Approach? | **A — market profiles.** Rejected: duplicating product rows per market. |

Duplicating rows was rejected because HS code and `name_ar` are facts about the
product, not about the market; duplicating them creates two rows that
quietly disagree over time. It would also break `priceHistoryFor`, which
matches on `product.name`.

## Design

### 1. `Market` as a profile in code

New file `src/lib/quote/markets.ts`. Code rather than a table: profiles carry
behaviour (which incoterms, which destination list, which caveat sentence), and
this codebase already keeps `PORTS`, `CURRENCIES`, `UNITS` and `CONTAINER_TYPE`
as code constants.

```ts
export type MarketId = "gulf" | "russia";

export interface Market {
  id: MarketId;
  /** Dictionary key for the team-facing label — never a hardcoded string. */
  labelKey: string;
  mode: "sea" | "overland";
  /** The two incoterms this market quotes on. */
  terms: { base: string; delivered: string };
  /** Which list the destination picker offers. */
  destinations: "ports" | "overland";
  /** Origin/destination a fresh quote starts on. */
  defaultRoute: { origin: string; destination: string };
  /** Whether the quote prints both prices or only the delivered one. */
  priceShape: "two" | "delivered";
  /** What the margin is applied to. See §9. */
  markupBase: "goods" | "landed";
  /** Quote languages offered for this market, first is the default. */
  langs: QuoteLang[];
  /** Standing cost lines, in journey order, with this market's currencies and units. */
  costLines: () => CostLine[];
  /** Lines this market expects in USD — drives the "should be USD" warning. */
  usdExpected: readonly string[];
}
```

`gulf` = `{ mode: "sea", terms: FOB/CIF, destinations: "ports", priceShape:
"two", markupBase: "goods", langs: ["en", "ar"], costLines: today's
defaultCostLines(), usdExpected: ["freight", "bank"] }`.

**Hard constraint: the `gulf` profile reproduces current behaviour exactly.**
No existing quote may move by a cent. Pinned by a test (§8).

### 2. The Russian cost stack

Eight standing lines in journey order, with the two costs the spreadsheet
conflates pulled apart:

| id | Label | Currency | Unit | From the sheet |
|---|---|---|---|---|
| `farm` | Farm price (EXW) | RMB | **per MT** | ¥8,300/T |
| `packing` | Packaging | RMB | per carton | blank — inside EXW |
| `inland` | Inland to Khorgos | RMB | per container | ¥18,000 |
| `border` | Border transhipment | **USD** | per container | ~$500, inside ¥47,570 |
| `freight` | Freight Khorgos → destination | **RMB** | per container | rest of ¥47,570 |
| `customs` | Customs & agent fee | RMB | per container | ¥5,000 |
| `transit` | Kazakhstan transit tax | **USD** | **per MT** | $250 / $240 / $150 |
| `bank` | Bank charges | USD | flat | — |

Splitting `border` out of `freight` matters: the transhipment fee is fixed while
the carriage is volatile, and they age at different rates (§7).

Consequences:

- `FIXED_COST_IDS` becomes the **union** of all markets' standing ids
  (`farm, packing, freight, customs, inland, bank, border, transit`), so
  `isFixedLine()` keeps working unchanged. Each market declares its own ordered
  subset via `costLines()`.
- `USD_EXPECTED_LINES` moves onto the profile as `usdExpected`. Russian freight
  is genuinely quoted in RMB; today's global guard would flag an error on every
  Russian quote.
- Russia's farm price is per MT, not per KG. Units stay editable either way.

### 3. Pack format per product per market

New column on `products`:

```sql
alter table public.products
  add column if not exists market_packs jsonb not null default '{}'::jsonb;
```

```json
{ "russia": { "cartons": 1440, "nw": 13.6, "gw": 14.2,
              "packUnit": "carton", "transitTaxPerMT": 250 } }
```

The existing columns stay the Gulf/default pack. **No data migration, no
existing row modified** — an untouched product simply has no `russia` key and
falls through to its current values.

Resolution order in `useQuoteCalculator` becomes:

```
typed this session → market pack → product default → generic default
```

This preserves the existing precedence rule ("product data outranks the saved
sheet", added because a stale sheet snapshot was overriding corrected product
data); the market pack simply sits one rung above the product default. The
`set()` helper — which treats 0 as "not filled in" because the columns are
`NOT NULL DEFAULT 0` — applies to market-pack values too.

`transitTaxPerMT` seeds the `transit` line's amount when a Russian sheet is
created, so ginger's $250 arrives with the product rather than being retyped.

`ProductProfile` gains `marketPacks: Record<string, MarketPack>`; `dbToLocal`,
`localToDb` and the explicit column list in `useSaveProduct`'s update branch all
need the new field. The Products page grows a "Russian pack" section showing
only the fields that differ from the default pack.

### 4. Cost sheets get a market

```sql
alter table public.product_cost_sheets
  add column if not exists market text not null default 'gulf';

alter table public.product_cost_sheets
  drop constraint if exists product_cost_sheets_one_per_day;

alter table public.product_cost_sheets
  add constraint product_cost_sheets_one_per_day
  unique (product_id, market, session_date);

drop index if exists idx_product_cost_sheets_product_date;

create index if not exists idx_product_cost_sheets_product_market_date
  on public.product_cost_sheets(product_id, market, session_date desc);
```

The `'gulf'` default backfills every existing row correctly — all of them are
Gulf sheets. The covering index is rebuilt on the new key so the "newest sheet
for this product in this market" lookup and the history list both stay indexed.

This is not cosmetic. Two live defects it fixes:

1. **Collision.** `unique (product_id, session_date)` means quoting Russian
   ginger and Gulf ginger on the same day overwrites one with the other.
2. **Cross-contamination.** `useLatestCostSheet()` seeds any never-costed
   product from the most recent sheet of *any* product. A Russian ¥47,570
   freight would silently seed the next Gulf quote. It becomes
   `useLatestCostSheet(market)`, filtered.

`market` must thread through all four places in `src/lib/data/cost-sheets.ts`:
the `useCostSheets` query filter and its query key, the upsert's
`onConflict: "product_id,market,session_date"`, the retry-queue
`conflictTarget` (same string), and the `idempotencyKey`
(`cost-sheet-${productId}-${market}-${sessionDate}`). Missing the last two means
a queued offline save replays into the wrong market.

`CostSheet` gains `market: MarketId`.

### 5. Destinations

A separate list in a new `src/lib/places.ts` — **not** merged into `PORTS`.
`PORTS` is consumed by `MasterDataForm` as well as the calculator, and land
destinations have no business appearing in a discharge-port picker on the
contract form.

```ts
export const OVERLAND_PLACES: Place[] = [
  { code: "KZKHO",    name: "Khorgos (border)",  country: "Kazakhstan" },
  { code: "RUMOWFC",  name: "Food City (Moscow)", country: "Russia" },
  { code: "RUMOW",    name: "Moscow",            country: "Russia" },
  { code: "RUOVB",    name: "Novosibirsk",       country: "Russia" },
  { code: "RUSVX",    name: "Yekaterinburg",     country: "Russia" },
];
```

`PortCombobox` gains an optional `places` prop defaulting to `PORTS`, so
`MasterDataForm` is untouched. `Place` shares `Port`'s shape (`{ code, name, country, countryCode }`) so
`formatPortValue` works on both.

**`portShortName` must NOT be used on overland places.** Tracing it on
`"FOOD CITY (MOSCOW), RUSSIA"`: `bare` strips the parenthetical to `"FOOD CITY"`,
and the `qualified` flag only suppresses the trailing-`PORT` strip — so it
returns `"Food City"` and the term reads `DAP Food City`, losing Moscow. That
function exists to strip the word "PORT" and the country from port values;
overland names are already short and are used verbatim. Both callers —
`quoteTerms()` in `quote-text.ts` and `sendToMasterData()` in `master-draft.ts` —
take the market and skip the shortening when `destinations` is `"overland"`.

### 6. Quote text and language

`QuoteLang` becomes `"en" | "ar" | "ru"`. The stored preference is per-browser
(`calculator.quoteLanguage`); `loadLang()` currently coerces anything that is
not `"ar"` to `"en"` and must be widened to a three-way check.

Language stays on the **quote** axis, not the team-UI axis. The team dictionary
(`src/lib/team-i18n`) remains English/Chinese for the app shell; Russian is a
buyer-facing output language only, exactly as Arabic is. These two axes are
deliberately separate and stay that way.

`buildQuoteText` gains a Russian branch. The Russian message drops the sea
vocabulary throughout:

- Cargo lines keep the `N × 40'HC · 1,440 cartons` / gross-weight-per-unit shape.
- `ETD:` becomes a dispatch date, labelled for road rather than a vessel.
- The two price lines (`*FOB Shekou*` / `*CIF Jeddah*`) collapse to one
  `*DAP Moscow*` price per unit, plus the `= $X per MT` restatement.
- The caveat *"Sea freight is unstable — CIF is re-confirmed at booking. FOB is
  firm for 7 days."* is replaced with the overland equivalent.

The WhatsApp formatting constraints documented in `quote-text.ts` are unchanged
and apply to Russian too: proportional font, so no column padding; `*bold*` is
WhatsApp markup; one product emoji only; short lines.

The Russian copy needs a native check before it goes to a buyer. Drafted in
implementation, flagged for team review.

`PricePanel.tsx:288` currently reads
`{code === "en" ? t("langEn") : t("langAr")}` — a binary ternary that becomes a
lookup, and the language buttons are filtered to the active market's `langs`.

### 7. UI labels and per-line staleness

These strings in `team-i18n/dictionary.ts` (`calc` namespace) are sea-specific
and need per-market variants in both `en` and `zh`:

`loadingPort` ("Loading port (FOB)"), `loadingPortA11y`, `loadingPortSearch`,
`dischargePort` ("Discharge port (CIF)"), `dischargePortA11y`,
`dischargePortSearch`, `etd` ("ETD (vessel departs)"), `etdA11y`,
`cifPricePerMt`, `fobPerCarton`, `plusSeaFreight`, `cifPerCarton`, `totalCif`,
`totalFob`.

`inRiyal` / `riyalRate` / `riyalPerCarton` / `riyalTotal` are Gulf-only and are
hidden on the Russian market rather than translated. No RUB is added to
`CURRENCIES` — the Russian trade is priced in USD and costed in RMB, and the
spreadsheet confirms it.

`freshness.ts` `STALE_AFTER_DAYS` gains `border: 90` and `transit: 90` — both
are administratively fixed, unlike `freight`'s 7 days.

### 8. Master Data handoff

`sendToMasterData` currently keeps the *term* from whatever draft already exists
(`splitIncoterm(base.shipping.incoterm).term`) and only replaces the place. For
Russia the term must come from the market profile (`DAP`), otherwise a Russian
quote hands a contract that still says CIF. `MasterDraftInput` gains the market's
delivered term.

The Master Data form's own port pickers still offer `PORTS` only; a Russian
destination handed over will arrive as a stored string the form displays but
cannot re-pick from its list. Accepted for now and recorded in §11.

### 9. `computeQuote` and the markup base

`QuoteInput` gains `markupBase: "goods" | "landed"`.

- `"goods"` (Gulf, unchanged): `markUp(landedCost − freight) + freight`. The
  documented invariant `cifPerCarton − fobPerCarton === freightPerCarton` holds,
  which is what lets a freight rise be restated without reopening the margin.
- `"landed"` (Russia): `markUp(landedCost)`. There is no pass-through story —
  the whole price is renegotiated weekly — and marking up only the goods would
  make the actual margin on the delivered price *lower* than the slider says.
  For a one-price market, `"landed"` is what makes 20% mean 20%.

**The FOB/CIF invariant holds only under `"goods"`.** To stop `fobPerCarton`
from being read as meaningful when it isn't, `Quote.fobPerCarton` and
`Quote.fobTotal` become `number | null`, null whenever `priceShape` is
`"delivered"`. TypeScript then forces every consumer — `PricePanel`,
`buildQuoteText`, `PriceOfferPDF` — to handle the case explicitly rather than
printing a plausible wrong number. `cifPerCarton` remains the delivered price
under both bases; `quotedPerCarton` stays its alias.

`freightUSD` still reads the `freight` line only, so for Russia it is the
Khorgos→Russia leg and excludes `inland` and `border`. Under `"landed"` it does
not enter the price at all and is informational.

### 10. Files touched

**New**
- `src/lib/quote/markets.ts` — profiles
- `src/lib/places.ts` — `OVERLAND_PLACES`
- `supabase/migrations/…_product_market_packs.sql`
- `supabase/migrations/…_cost_sheets_market.sql`

**Modified**
- `src/types/quote.ts` — `MarketId`, nullable FOB fields, `CostSheet.market`, new fixed ids
- `src/types/product.ts` — `marketPacks`
- `src/lib/quote/defaults.ts` — `FIXED_COST_IDS` union, `usdExpected` off the profile
- `src/lib/quote/pricing.ts` — `markupBase`
- `src/lib/quote/quote-text.ts` — Russian branch, market-driven terms and caveat
- `src/lib/quote/freshness.ts` — windows for `border`, `transit`
- `src/lib/quote/storage.ts` — three-way `QuoteLang`
- `src/lib/quote/master-draft.ts` — incoterm from the profile
- `src/lib/data/cost-sheets.ts` — market in query, key, conflict target, idempotency key
- `src/lib/data/products.ts` — `market_packs` mapping
- `src/lib/team-i18n/dictionary.ts` — per-market labels, `en` + `zh`
- `src/components/ui/port-combobox.tsx` — optional `places`
- `src/components/products/quote-calculator/` — `QuoteCalculator`, `useQuoteCalculator`, `CargoBar`, `CostSheet`, `PricePanel`, `PriceOfferPDF`, `PriceOfferDownload`
- `src/components/products/ProductManager.tsx` — Russian pack section

### 11. Testing

1. **Gulf regression pin (required).** A test that runs `computeQuote` over a
   fixed Gulf input and asserts the exact current output — every field, to the
   cent. This must be written and passing *before* the profile refactor lands,
   so it catches any drift the refactor introduces.
2. **The invariant.** `cifPerCarton − fobPerCarton === freightPerCarton` under
   `"goods"`; `fobPerCarton === null` under `"landed"`.
3. **The spreadsheet, reproduced.** Each row costed through the Russian profile
   at zero margin, `fx.RMB = 6.77`, transit tax entered in USD per MT:

   | | Calculator cost/box | Sheet says | Why they differ |
   |---|---|---|---|
   | Ginger | **$27.31** | $27.28 | one FX rate, not two |
   | Garlic | **$18.25** | $15.60 | + omitted customs & tax, one rate |
   | Kiwi | **$13.75** | $12.09 | + omitted customs & tax, one rate |

   The three-cent gap on ginger — the only row whose Total was summed correctly —
   is the whole point: the sheet converts the transit tax at ¥6.70 and everything
   else at ¥6.77, while the calculator holds one rate per sheet. The tax line is
   entered in USD and never passes through FX at all. Divergence here is a pass,
   not a failure; matching the sheet exactly would mean reproducing its bugs.

   For this fixture the ¥47,570 stays whole on the `freight` line and `border`
   is 0. Splitting the ~$500 transhipment out (§2) is a modelling improvement
   that must leave these totals unchanged — which is itself worth asserting.
4. **Pack resolution order.** Typed value beats market pack beats product
   default beats generic; a market pack of 0 is treated as unset.
5. **Sheet isolation.** A Russian and a Gulf sheet for the same product on the
   same day coexist; `useLatestCostSheet("gulf")` never returns a Russian sheet.

### 12. Out of scope

- **Cyrillic PDF.** The offer PDF is English-only today — `PriceOfferDownload`
  takes no `lang` prop at all, so Arabic quotes already go out as Russian ones
  will: Arabic/Russian WhatsApp text, English PDF. (If a Russian PDF is wanted
  later, whether the bundled `NotoSansSC-Regular.ttf` carries Cyrillic glyphs
  has not been verified — check before assuming.)
- **Multi-product quotes.** Three separate offers, per the team's answer.
- **Supplier comparison table.** Not what the spreadsheet was.
- **RUB.** Not used anywhere in the trade.
- **Master Data port picker** for overland destinations — see §8.

### 13. Assumptions and open questions

1. **`markupBase: "landed"` for Russia** is a decision taken on the team's
   behalf and flagged at design review. On a $100 landed cost with $30 carriage
   at 20% margin it is the difference between $117.50 and $125 — 6%. It is one
   field on the profile if wrong.
2. **The Russian price shape is one delivered price.** Inferred from "the price
   changes every week … save the last change as we did before", which answered
   persistence rather than presentation. If both prices are wanted, set
   `priceShape: "two"` and `markupBase: "goods"`.
3. **The destination list is a seed.** Moscow and Novosibirsk were named; Food
   City was suggested; Yekaterinburg and Khorgos are inferred from the route.
   The team should extend it.
4. **The $500 border transhipment** is the team's approximation of a component
   inside ¥47,570. Splitting it out is an improvement on the spreadsheet, not a
   figure carried over from it.
5. **Russian quote copy** needs a native reader's check before first use.

### 14. Implementation note

Per `AGENTS.md`: this project's Next.js differs from what is in training data.
Read the relevant guide under `node_modules/next/dist/docs/` before writing
code, and heed deprecation notices.
