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
