-- Boxes per container as product data, plus the Black Cat ginger variety.
--
-- How many boxes fill a container is a fixed property of the product's pack
-- format, not something to retype per quote: ginger is 11,088 boxes, mesh
-- garlic 11,600 bags, carrots 7,568 boxes. Getting it wrong silently changes
-- the quantity, the price per MT and the total, so it belongs next to the
-- carton weights it is quoted with.
--
-- Sanity check on the figures below — each lands on a plausible reefer load:
--   ginger   11,088 x 2.30 kg = 25.50 MT
--   garlic   11,600 x 2.50 kg = 29.00 MT
--   carrots   7,568 x 3.70 kg = 28.00 MT

-- Wrapped in a transaction (as 20260530_100000 is) so a hand-paste that fails
-- part way leaves the table exactly as it was rather than half-migrated.
begin;

alter table public.products
  add column if not exists default_cartons integer not null default 0;

alter table public.products
  drop constraint if exists products_default_cartons_check;

alter table public.products
  add constraint products_default_cartons_check check (default_cartons >= 0);

comment on column public.products.default_cartons is
  'Boxes/bags that fill one container for this pack format. 0 means not set — '
  'the calculator falls back to its generic default.';

-- Known pack formats. Matched on the exact stored names; other products keep 0
-- until the team fills them in on the Products page.
update public.products set default_cartons = 11088 where name = 'Fresh Ginger';
update public.products set default_cartons = 11600 where name = 'Fresh Garlic-Mesh';
update public.products set default_cartons =  7568 where name = 'FRESH CARROTS';

-- ─── Fresh Ginger Black Cat ────────────────────────────────
-- A ginger variety, so it shares HS 0910.1100 with Fresh Ginger. Prefix GGB
-- follows the existing GG (ginger) / GLC (garlic carton) pattern and does not
-- collide with APP, BA, CR, GLC, GL, GG, KW, LEM, SEL.
--
-- Carton weights are deliberately left at 0: 9,800 boxes against Fresh Ginger's
-- 11,088 means a different box, so copying ginger's 2.3/2.5 kg would be a
-- guess that silently prices every quote wrong. The calculator blocks a quote
-- until a net weight is entered, which is the intended prompt.
--
-- WHERE NOT EXISTS guards a re-run (the prefix is UNIQUE, so a second insert
-- would otherwise fail the whole migration).
insert into public.products
  (name, name_ar, prefix, hs_code, default_nw, default_gw, default_price_mt, container_type, default_cartons, notes)
select
  'Fresh Ginger Black Cat',
  'زنجبيل طازج بلاك كات',
  'GGB',
  '0910.1100',
  0,
  0,
  0,
  '40''HC',
  9800,
  'Set N.W. and G.W. per carton before quoting.'
where not exists (
  select 1 from public.products where name = 'Fresh Ginger Black Cat' or prefix = 'GGB'
);

commit;
