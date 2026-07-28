-- Per-product cost sheets for the Quote Calculator, with session history.
--
-- Feature: the team re-quotes the same products constantly, and most costs
-- barely move — the farm price changes every few days, sea freight weekly, and
-- customs / inland / bank charges hardly at all. Re-entering six lines per
-- quote was the tedious part, and a rate that lived in one person's browser was
-- how two people quoted the same product differently.
--
-- Each row is ONE SESSION: the costing for one product on one day. Editing
-- during the day updates that day's row (the unique constraint below makes the
-- upsert unambiguous); the first save on a new day files a new row, so the
-- history reads as "now / 3 days ago / Jul 12" without accumulating a row per
-- keystroke. The newest row for a product is the working sheet.
--
-- SECURITY: this table holds our buy-side costs and target margins. It is
-- team-only — there is deliberately NO client policy of any kind, unlike
-- sailing_schedules or loading_plans. A client who could read this would see
-- exactly what we pay the farm and what we make on them.

create table if not exists public.product_cost_sheets (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,

  -- One session per product per day. Date, not timestamp, so same-day edits
  -- collapse into one session.
  session_date  date not null default current_date,

  -- CostLine[]: { id, label, amount, currency, unit, updatedAt }. JSONB because
  -- the line set is user-extensible (a shipment can add fumigation, phyto, a
  -- one-off port charge) — a fixed column per cost would not survive that.
  -- Per-line updatedAt is what drives the staleness flag in the UI.
  lines         jsonb not null default '[]'::jsonb,

  -- The FX rates this sheet was costed at. Stored per sheet so a reopened
  -- session reproduces its original USD figures instead of being silently
  -- recalculated at today's rates.
  fx            jsonb not null default '{}'::jsonb,

  margin_pct    numeric(5,2) not null default 20
    check (margin_pct >= 0 and margin_pct <= 95),

  -- Denormalised outcome, so the history list can show what each session
  -- produced without replaying the whole calculation client-side.
  quoted_per_mt numeric(12,2),

  -- Shipment shape at save time: { containers, cartonsPerContainer,
  -- nwPerCarton, gwPerCarton }. Needed to make quoted_per_mt meaningful.
  cargo         jsonb not null default '{}'::jsonb,

  created_by    uuid default auth.uid() references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint product_cost_sheets_one_per_day unique (product_id, session_date)
);

-- Covers both hot paths: "newest sheet for this product" and the history list.
create index if not exists idx_product_cost_sheets_product_date
  on public.product_cost_sheets(product_id, session_date desc);

-- Covers "the most recently saved sheet of any product", used to seed a
-- product that has never been costed.
create index if not exists idx_product_cost_sheets_updated
  on public.product_cost_sheets(updated_at desc);

alter table public.product_cost_sheets enable row level security;

-- Team / super_admin only. No client policy — see the SECURITY note above.
create policy "product_cost_sheets team full" on public.product_cost_sheets
  for all using (public.is_team()) with check (public.is_team());

create trigger trg_product_cost_sheets_updated_at
  before update on public.product_cost_sheets
  for each row execute function public.set_updated_at();
