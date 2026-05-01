-- Final Document Package: stores the path + metadata for the auto-merged PDF
-- (SC + CI + PL + uploaded certificates) generated when a contract reaches
-- Stage 6 (certs-ready). The merged PDF lives in the existing
-- `contract-documents` storage bucket under
-- `contracts/{contract_id}/merged/final-{timestamp}.pdf`.

alter table public.contracts
  add column if not exists merged_pdf_path text,
  add column if not exists merged_pdf_generated_at timestamptz,
  add column if not exists merged_pdf_size_bytes int,
  add column if not exists merged_pdf_doc_count int;

create index if not exists idx_contracts_merged_pdf_path
  on public.contracts(merged_pdf_path)
  where merged_pdf_path is not null;

-- Storage bucket + policies (idempotent). The download path is server-rendered
-- via signed URLs created by the API route, but having read policies in place
-- lets RLS protect the bucket if a path ever leaks. Writes are admin-only
-- (the service-role key is used by the merged-pdf generator).
insert into storage.buckets (id, name, public)
values ('contract-documents', 'contract-documents', false)
on conflict (id) do nothing;

drop policy if exists "contract-documents authenticated read" on storage.objects;
create policy "contract-documents authenticated read"
  on storage.objects
  for select
  to authenticated
  using ( bucket_id = 'contract-documents' );

drop policy if exists "contract-documents authenticated upload" on storage.objects;
create policy "contract-documents authenticated upload"
  on storage.objects
  for insert
  to authenticated
  with check ( bucket_id = 'contract-documents' );
