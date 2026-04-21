-- Row-Level Security policies for TAFAKAH.
-- Run this AFTER 20260421_000001_initial_schema.sql.

begin;

-- ── Helpers ──────────────────────────────────────────────────
create or replace function public.is_team()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.users_profile
    where user_id = auth.uid() and role = 'team' and is_active = true
  );
$$;

create or replace function public.client_buyer_id()
returns uuid language sql security definer stable as $$
  select buyer_id from public.users_profile
  where user_id = auth.uid() and role = 'client' and is_active = true
  limit 1;
$$;

-- ── Enable RLS ───────────────────────────────────────────────
alter table public.users_profile      enable row level security;
alter table public.buyers             enable row level security;
alter table public.sellers            enable row level security;
alter table public.products           enable row level security;
alter table public.contracts          enable row level security;
alter table public.contract_finance   enable row level security;
alter table public.contract_shipping  enable row level security;
alter table public.contract_documents enable row level security;

-- ── users_profile ────────────────────────────────────────────
create policy "users_profile select own or team" on public.users_profile
  for select using (user_id = auth.uid() or public.is_team());
create policy "users_profile team writes" on public.users_profile
  for all using (public.is_team()) with check (public.is_team());

-- ── buyers ───────────────────────────────────────────────────
create policy "buyers team full" on public.buyers
  for all using (public.is_team()) with check (public.is_team());
create policy "buyers client own" on public.buyers
  for select using (id = public.client_buyer_id());

-- ── sellers (team only; clients never see sellers) ──────────
create policy "sellers team only" on public.sellers
  for all using (public.is_team()) with check (public.is_team());

-- ── products ────────────────────────────────────────────────
create policy "products team full" on public.products
  for all using (public.is_team()) with check (public.is_team());
create policy "products client read" on public.products
  for select using (public.client_buyer_id() is not null);

-- ── contracts ───────────────────────────────────────────────
create policy "contracts team full" on public.contracts
  for all using (public.is_team()) with check (public.is_team());
create policy "contracts client own" on public.contracts
  for select using (buyer_id = public.client_buyer_id());

-- ── contract_finance ────────────────────────────────────────
-- NOTE: Clients get SELECT on the whole row here because RLS is row-level, not column-level.
-- The app/API layer MUST strip `cost_items` from responses before sending to a client user.
-- See: src/lib/supabase/*.ts callers that return client-facing finance data.
create policy "contract_finance team full" on public.contract_finance
  for all using (public.is_team()) with check (public.is_team());
create policy "contract_finance client own" on public.contract_finance
  for select using (
    exists (select 1 from public.contracts c where c.id = contract_id and c.buyer_id = public.client_buyer_id())
  );

-- ── contract_shipping ───────────────────────────────────────
create policy "contract_shipping team full" on public.contract_shipping
  for all using (public.is_team()) with check (public.is_team());
create policy "contract_shipping client own" on public.contract_shipping
  for select using (
    exists (select 1 from public.contracts c where c.id = contract_id and c.buyer_id = public.client_buyer_id())
  );

-- ── contract_documents (clients never see ci-customs) ──────
create policy "contract_documents team full" on public.contract_documents
  for all using (public.is_team()) with check (public.is_team());
create policy "contract_documents client filtered" on public.contract_documents
  for select using (
    doc_type <> 'ci-customs'
    and exists (select 1 from public.contracts c where c.id = contract_id and c.buyer_id = public.client_buyer_id())
  );

commit;
