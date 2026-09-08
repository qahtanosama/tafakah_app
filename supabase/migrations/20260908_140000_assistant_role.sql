-- A fourth role: assistant.
--
-- An assistant handles paperwork and shipment tracking. She downloads and
-- uploads documents and keeps ETD / ETA / vessel / status current. She must
-- never see what we paid the farm, what we make on a shipment, or what a buyer
-- has paid us.
--
-- THE WHOLE DESIGN IS THAT SHE SITS OUTSIDE is_team().
--
-- This is the mirror image of how super_admin was added. That role was folded
-- INTO is_team() so it inherited every existing grant without touching a
-- policy. An assistant needs strictly less, so she must stay out of that helper
-- and be granted back only what she needs, one table at a time. Anything added
-- to this schema in future is therefore denied to her by default, which is the
-- correct direction for a restricted role to fail.
--
-- What that buys, for free and at the DATABASE rather than in the UI:
--   • contract_finance    — "contract_finance team full" is USING (is_team()).
--                           She is not team, so payments received are invisible.
--   • product_cost_sheets — same helper. Farm price, margin and profit likewise.
-- Hiding those in the interface alone would be no protection at all: the same
-- rows come back to anyone who calls the REST API with her token.
--
-- What she CAN see, deliberately: contract sale prices. She reads them off the
-- Commercial Invoice she is expected to download anyway, so withholding them on
-- screen would obstruct her without concealing anything.

begin;

-- ─── 1) Widen the role check ───────────────────────────────────────────────
alter table public.users_profile
  drop constraint if exists users_profile_role_check;

alter table public.users_profile
  add constraint users_profile_role_check
  check (role in ('super_admin', 'team', 'client', 'assistant'));

-- ─── 2) Helper ─────────────────────────────────────────────────────────────
create or replace function public.is_assistant()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users_profile
    where user_id = auth.uid()
      and role = 'assistant'
      and is_active = true
  );
$$;

comment on function public.is_assistant() is
  'True for an active assistant. Deliberately NOT part of is_team(): an '
  'assistant is granted individual tables, and anything not named here is '
  'denied to her.';

-- Staff who may touch the document store: team, super_admin, or assistant.
-- Used by the storage policies below so all three stay in one place.
create or replace function public.is_doc_staff()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_team() or public.is_assistant();
$$;

-- ─── 3) What the assistant may reach ───────────────────────────────────────
-- Read-only reference data. Needed to render a contract, a shipment row and a
-- document list at all.
drop policy if exists "products assistant read" on public.products;
create policy "products assistant read" on public.products
  for select using (public.is_assistant());

drop policy if exists "buyers assistant read" on public.buyers;
create policy "buyers assistant read" on public.buyers
  for select using (public.is_assistant());

drop policy if exists "sellers assistant read" on public.sellers;
create policy "sellers assistant read" on public.sellers
  for select using (public.is_assistant());

drop policy if exists "issuing_entities assistant read" on public.issuing_entities;
create policy "issuing_entities assistant read" on public.issuing_entities
  for select using (public.is_assistant());

-- Contracts: read only. She never creates, edits or deletes one.
drop policy if exists "contracts assistant read" on public.contracts;
create policy "contracts assistant read" on public.contracts
  for select using (public.is_assistant());

-- Shipment tracking: the one thing she actively maintains. Select and update
-- only — a shipping row is created with its contract, and deleting one would
-- orphan the tracking history.
drop policy if exists "contract_shipping assistant read" on public.contract_shipping;
create policy "contract_shipping assistant read" on public.contract_shipping
  for select using (public.is_assistant());

drop policy if exists "contract_shipping assistant update" on public.contract_shipping;
create policy "contract_shipping assistant update" on public.contract_shipping
  for update using (public.is_assistant()) with check (public.is_assistant());

-- Documents: download and upload. No update, no delete — replacing or removing
-- a certificate is a decision, not paperwork.
drop policy if exists "contract_documents assistant read" on public.contract_documents;
create policy "contract_documents assistant read" on public.contract_documents
  for select using (public.is_assistant());

drop policy if exists "contract_documents assistant insert" on public.contract_documents;
create policy "contract_documents assistant insert" on public.contract_documents
  for insert with check (public.is_assistant());

-- NOTHING is granted on contract_finance or product_cost_sheets. Their existing
-- policies are USING (is_team()), and with no assistant policy alongside them
-- RLS denies by default. That is the protection; do not "helpfully" add one.

commit;

-- ─── 4) Document storage ───────────────────────────────────────────────────
-- Outside the transaction, matching the original migration: Supabase reloads
-- policy caches per statement. Safe to repeat.
--
-- ALSO FIXES A LIVE BUG. All four of these policies were written with an inline
-- `up.role = 'team'` rather than going through is_team(). When super_admin was
-- added, is_team() was redefined to include it and every table policy followed
-- — but these four did not, so a super_admin has been unable to read, upload,
-- update or delete contract documents. Routing them through the helpers fixes
-- that at the same time as admitting the assistant.

drop policy if exists "contract-documents read" on storage.objects;
create policy "contract-documents read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'contract-documents'
    and (
      public.is_doc_staff()
      or exists (
        select 1
        from public.contracts c
        join public.users_profile up on up.buyer_id = c.buyer_id
        where up.user_id = auth.uid()
          and up.role = 'client'
          and up.is_active
          and storage.objects.name like 'contracts/' || c.id || '/%'
      )
    )
  );

drop policy if exists "contract-documents write" on storage.objects;
create policy "contract-documents write"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'contract-documents' and public.is_doc_staff());

-- Update and delete stay team-only: the assistant uploads, she does not
-- overwrite or remove what is already filed.
drop policy if exists "contract-documents update" on storage.objects;
create policy "contract-documents update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'contract-documents' and public.is_team());

drop policy if exists "contract-documents delete" on storage.objects;
create policy "contract-documents delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'contract-documents' and public.is_team());
