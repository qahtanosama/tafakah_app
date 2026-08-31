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
--
-- NOTE: only ginger's 14.2 kg gross came from the source sheet. The garlic and
-- kiwi gross weights below are estimates — correct them on the Products page.
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
