-- Sailing schedules + client loading plans.
--
-- Feature: the team publishes the upcoming vessel departures from the port of
-- loading (imported from the weekly carrier Excel sheet); clients view the
-- schedule in the portal and reply with a loading plan ("we want N containers
-- on this vessel, cargo ready on date X"). Security model mirrors
-- contract_arrival_reports:
--   * Team / super_admin (is_team()) have full access to both tables.
--   * Any ACTIVE client may READ the schedule (it is port-wide, not
--     buyer-scoped — same pattern as the products read policy).
--   * A client may insert/read/update a loading plan ONLY for their own
--     buyer (client_buyer_id()) and only as themselves (created_by).

-- ─── sailing_schedules ─────────────────────────────────────
create table if not exists public.sailing_schedules (
  id             uuid primary key default gen_random_uuid(),
  shipping_line  text not null,
  vessel         text not null,
  voyage         text,
  port_of_loading text,
  destination    text,
  etd            date,
  eta            date,
  cargo_cutoff   date,
  doc_cutoff     date,
  notes          text,
  status         text not null default 'open'
    check (status in ('open','closed','departed','cancelled')),
  created_by     uuid default auth.uid() references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_sailing_schedules_etd
  on public.sailing_schedules(etd);

alter table public.sailing_schedules enable row level security;

-- Team / super_admin: full access.
create policy "sailing_schedules team full" on public.sailing_schedules
  for all using (public.is_team()) with check (public.is_team());

-- Client: any active client may read the schedule (port-wide data).
create policy "sailing_schedules client read" on public.sailing_schedules
  for select using (public.client_buyer_id() is not null);

create trigger trg_sailing_schedules_updated_at
  before update on public.sailing_schedules
  for each row execute function public.set_updated_at();

-- ─── loading_plans ─────────────────────────────────────────
create table if not exists public.loading_plans (
  id               uuid primary key default gen_random_uuid(),
  schedule_id      uuid not null references public.sailing_schedules(id) on delete cascade,
  buyer_id         uuid not null references public.buyers(id) on delete cascade,
  contract_id      uuid references public.contracts(id) on delete set null,
  containers       integer check (containers > 0),
  quantity         text,
  cargo_ready_date date,
  notes            text,
  status           text not null default 'submitted'
    check (status in ('submitted','confirmed','booked','declined','cancelled')),
  created_by       uuid not null default auth.uid() references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_loading_plans_schedule
  on public.loading_plans(schedule_id);
create index if not exists idx_loading_plans_buyer
  on public.loading_plans(buyer_id);

alter table public.loading_plans enable row level security;

-- Team / super_admin: full access (including status transitions + delete).
create policy "loading_plans team full" on public.loading_plans
  for all using (public.is_team()) with check (public.is_team());

-- Client: read their own buyer's plans.
create policy "loading_plans client read" on public.loading_plans
  for select using (buyer_id = public.client_buyer_id());

-- Client: submit only for their own buyer, only as themselves.
create policy "loading_plans client insert" on public.loading_plans
  for insert with check (
    created_by = auth.uid()
    and buyer_id = public.client_buyer_id()
  );

-- Client: edit/cancel only their own still-pending plans. A client can move a
-- plan between 'submitted' and 'cancelled' but can never grant itself a
-- team-only status ('confirmed'/'booked'/'declined').
create policy "loading_plans client update" on public.loading_plans
  for update
  using (
    created_by = auth.uid()
    and buyer_id = public.client_buyer_id()
    and status = 'submitted'
  )
  with check (
    created_by = auth.uid()
    and buyer_id = public.client_buyer_id()
    and status in ('submitted','cancelled')
  );
-- (No client DELETE policy — only team/super_admin may delete.)

create trigger trg_loading_plans_updated_at
  before update on public.loading_plans
  for each row execute function public.set_updated_at();
