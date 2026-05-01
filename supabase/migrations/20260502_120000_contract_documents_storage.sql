-- Cert uploads move from IndexedDB to Supabase Storage. The metadata table
-- gets richer columns (mime, size, archive flag, AI analysis) and we relax the
-- one-cert-per-type uniqueness constraint to support soft-archive-then-replace
-- and unlimited "other" attachments.

begin;

alter table public.contract_documents
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists ai_metadata jsonb;

-- Backfill size_bytes from the legacy file_size column where present.
update public.contract_documents
  set size_bytes = file_size
  where size_bytes is null and file_size is not null;

-- The original `unique (contract_id, doc_type)` blocks both:
--   (a) replacing a cert (old archived row + new active row of same type), and
--   (b) multiple "other" attachments per contract.
-- Drop it and replace with a partial unique index that only enforces
-- single-active-per-type for the four cert slots (co/health/phyto/bl/sc/ci/...
-- — anything other than "other").
alter table public.contract_documents
  drop constraint if exists contract_documents_contract_id_doc_type_key;

drop index if exists idx_contract_documents_active_per_type;
create unique index idx_contract_documents_active_per_type
  on public.contract_documents (contract_id, doc_type)
  where is_archived = false and doc_type <> 'other';

create index if not exists idx_contract_documents_contract_active
  on public.contract_documents (contract_id)
  where is_archived = false;

-- Existing RLS on `contract_documents` already scopes by team/client.
-- We extend the client-read policy to also exclude archived rows, so old
-- replaced certs don't leak into the portal.
drop policy if exists "contract_documents client filtered" on public.contract_documents;
create policy "contract_documents client filtered" on public.contract_documents
  for select using (
    is_archived = false
    and doc_type <> 'ci-customs'
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.buyer_id = public.client_buyer_id()
    )
  );

commit;

-- ─── Storage policies for `contract-documents` bucket ───────────────────
--
-- We replace the broad "any authenticated user can read" policies with
-- principle-of-least-privilege:
--   * Team users (users_profile.role = 'team') can read/insert/update/delete.
--   * Client users can read only objects whose path starts with
--     `contracts/{their-buyer's-contract-id}/`.
--
-- These run outside the transaction because Supabase reloads policy caches
-- per statement; safe to repeat.

insert into storage.buckets (id, name, public)
values ('contract-documents', 'contract-documents', false)
on conflict (id) do nothing;

drop policy if exists "contract-documents authenticated read" on storage.objects;
drop policy if exists "contract-documents authenticated upload" on storage.objects;
drop policy if exists "contract-documents read" on storage.objects;
drop policy if exists "contract-documents write" on storage.objects;
drop policy if exists "contract-documents update" on storage.objects;
drop policy if exists "contract-documents delete" on storage.objects;

create policy "contract-documents read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'contract-documents'
    and (
      exists (
        select 1 from public.users_profile up
        where up.user_id = auth.uid()
          and up.role = 'team'
          and up.is_active
      )
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

create policy "contract-documents write"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'contract-documents'
    and exists (
      select 1 from public.users_profile up
      where up.user_id = auth.uid() and up.role = 'team' and up.is_active
    )
  );

create policy "contract-documents update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'contract-documents'
    and exists (
      select 1 from public.users_profile up
      where up.user_id = auth.uid() and up.role = 'team' and up.is_active
    )
  );

create policy "contract-documents delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'contract-documents'
    and exists (
      select 1 from public.users_profile up
      where up.user_id = auth.uid() and up.role = 'team' and up.is_active
    )
  );
