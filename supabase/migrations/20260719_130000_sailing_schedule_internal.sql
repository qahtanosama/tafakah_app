-- Fit the real carrier Excel sheet (POL/POD/SHIPPING LIST/VESSEL-VOYAGE/
-- TRANSIT DAY/OCEAN FREIGHT/...). Run AFTER 20260719_120000.
--
-- Two additions:
--   1. Client-visible columns on sailing_schedules: transit_days and
--      commodity (the sheet groups sailings under product rows like
--      "FRESH CARROTS").
--   2. sailing_schedule_internal — freight rates, booking plan, space
--      release status, and remarks from the sheet. These reveal our cost
--      basis, so they live in a separate table with TEAM-ONLY RLS and no
--      client policy at all: clients cannot read them even by querying
--      the API directly.

alter table public.sailing_schedules
  add column if not exists transit_days integer check (transit_days >= 0),
  add column if not exists commodity text;

create table if not exists public.sailing_schedule_internal (
  schedule_id          uuid primary key references public.sailing_schedules(id) on delete cascade,
  ocean_freight        text,
  booking_plan         text,
  space_release_status text,
  remark               text,
  updated_at           timestamptz not null default now()
);

alter table public.sailing_schedule_internal enable row level security;

-- Team / super_admin only. Deliberately NO client policy.
create policy "sailing_internal team full" on public.sailing_schedule_internal
  for all using (public.is_team()) with check (public.is_team());

create trigger trg_sailing_internal_updated_at
  before update on public.sailing_schedule_internal
  for each row execute function public.set_updated_at();
