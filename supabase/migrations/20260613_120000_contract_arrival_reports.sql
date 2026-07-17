-- Client after-sales / arrival reports.
--
-- First client-WRITE + client-UPLOAD feature in the app. Security model:
--   * A client may insert/read/update an arrival report ONLY for a contract
--     whose buyer matches their users_profile.buyer_id (via client_buyer_id()).
--   * Team / super_admin (is_team()) have full access.
--   * Photos live under the existing private bucket at
--     contracts/{contractId}/arrival/...  — the EXISTING contract-documents
--     READ policy already scopes client reads to their own contract folder, so
--     no read-policy change is needed. We add ONLY a narrowly-scoped client
--     INSERT policy for the arrival/ subfolder. Nothing else is widened.

create table if not exists public.contract_arrival_reports (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references public.contracts(id) on delete cascade,
  container_number text,
  arrival_date     date,
  damaged_boxes    integer check (damaged_boxes >= 0),
  total_boxes      integer check (total_boxes  >= 0),
  condition        text check (condition in ('good','fair','poor')),
  issue_tags       jsonb not null default '[]'::jsonb,
  comments         text,
  photo_paths      jsonb not null default '[]'::jsonb,
  created_by       uuid not null default auth.uid() references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_arrival_reports_contract
  on public.contract_arrival_reports(contract_id);

alter table public.contract_arrival_reports enable row level security;

-- Team / super_admin: full access.
create policy "arrival_reports team full" on public.contract_arrival_reports
  for all using (public.is_team()) with check (public.is_team());

-- Client: read reports for their own contracts.
create policy "arrival_reports client read" on public.contract_arrival_reports
  for select using (
    exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.buyer_id = public.client_buyer_id()
    )
  );

-- Client: insert only on their own contract, only as themselves.
create policy "arrival_reports client insert" on public.contract_arrival_reports
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.buyer_id = public.client_buyer_id()
    )
  );

-- Client: edit only their own reports on their own contract.
create policy "arrival_reports client update" on public.contract_arrival_reports
  for update
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.buyer_id = public.client_buyer_id()
    )
  )
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.buyer_id = public.client_buyer_id()
    )
  );
-- (No client DELETE policy — only team/super_admin may delete.)

-- keep updated_at fresh on edit
create or replace function public.set_arrival_report_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_arrival_reports_updated_at
  before update on public.contract_arrival_reports
  for each row execute function public.set_arrival_report_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: allow a client to UPLOAD arrival photos into their own contract's
-- arrival/ subfolder of the existing private contract-documents bucket.
-- Additive only — existing team write/update/delete and all read policies are
-- untouched. Reads already work via the existing "contract-documents read"
-- policy (path prefix contracts/{contractId}/).
-- ---------------------------------------------------------------------------
create policy "contract-documents client arrival write"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contract-documents'
    and storage.objects.name like 'contracts/%/arrival/%'
    and exists (
      select 1
      from public.contracts c
      join public.users_profile up on up.buyer_id = c.buyer_id
      where up.user_id = auth.uid()
        and up.role = 'client'
        and up.is_active
        and storage.objects.name like 'contracts/' || c.id || '/arrival/%'
    )
  );
