-- Adds the preferred_language column for portal users.
-- Idempotent — safe to re-run.
begin;

alter table public.users_profile
  add column if not exists preferred_language text default 'en'
  check (preferred_language in ('en', 'ar'));

-- Backfill any existing client rows that have null preferred_language.
update public.users_profile
   set preferred_language = 'en'
 where preferred_language is null;

-- Allow clients to update only their own preferred_language (no other column).
-- Server action enforces the column allowlist; RLS provides the row scope.
drop policy if exists "users_profile client update own prefs" on public.users_profile;
create policy "users_profile client update own prefs" on public.users_profile
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
