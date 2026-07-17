-- Allow a client to DELETE their OWN arrival report, and to remove that
-- report's photos from storage. Both policies are additive and narrowly scoped;
-- nothing else is widened. Team/super_admin already delete via the existing
-- "arrival_reports team full" / "contract-documents delete" (team) policies.

-- Table: a client may delete a report ONLY when they created it AND the
-- contract's buyer is theirs — scoped identically to the client UPDATE policy.
create policy "arrival_reports client delete" on public.contract_arrival_reports
  for delete using (
    created_by = auth.uid()
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.buyer_id = public.client_buyer_id()
    )
  );

-- Storage: a client may delete an object ONLY inside their own contract's
-- arrival/ subfolder (mirror of the existing client arrival WRITE policy). This
-- is what lets the RLS-scoped server action clean up photos on delete without
-- the admin client. Certs and merged/ stay team-only.
create policy "contract-documents client arrival delete"
  on storage.objects
  for delete to authenticated
  using (
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
