-- Three-tier role system: super_admin > team > client.
--
-- Design notes:
--   * Every existing RLS policy that grants the team role broad access goes
--     through `public.is_team()`. We REDEFINE that helper to match
--     ('team', 'super_admin') so super_admin inherits team capabilities on every
--     table without having to touch a single policy. (Spec calls this
--     "is_team_or_super"; we keep the name `is_team` for zero-risk backward
--     compat and add `is_team_or_super` as a documented alias.)
--   * `is_super_admin()` is added for the strict super-admin-only checks
--     (audit log, impersonation, role changes).
--   * The role check constraint widens to allow 'super_admin'.
--   * osama711753@gmail.com gets a profile row; the WHERE NOT EXISTS guards
--     against double-runs of this migration.
--   * audit_log + impersonation_sessions are new tables with their own RLS.

begin;

-- ─── 1) Widen role check constraint ───────────────────────────────
alter table public.users_profile
  drop constraint if exists users_profile_role_check;

alter table public.users_profile
  add constraint users_profile_role_check
  check (role in ('super_admin', 'team', 'client'));

-- ─── 2) Profile for osama711753@gmail.com (if not already present) ─
insert into public.users_profile (user_id, role, full_name, is_active)
select au.id, 'super_admin', 'Sam (Super Admin)', true
from auth.users au
where au.email = 'osama711753@gmail.com'
  and not exists (
    select 1 from public.users_profile up where up.user_id = au.id
  );

-- ─── 3) Helper functions ──────────────────────────────────────────
-- Redefine is_team() so super_admin inherits team-grade RLS access on every
-- table that already calls this helper. Existing policies do not need to
-- change.
create or replace function public.is_team()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users_profile
    where user_id = auth.uid()
      and role in ('team', 'super_admin')
      and is_active = true
  );
$$;

-- Alias for code clarity in new policies / call sites.
create or replace function public.is_team_or_super()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_team();
$$;

-- Strict super-admin-only check.
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users_profile
    where user_id = auth.uid()
      and role = 'super_admin'
      and is_active = true
  );
$$;

-- ─── 4) audit_log table ───────────────────────────────────────────
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  target_resource_type text,
  target_resource_id text,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_actor on public.audit_log(actor_user_id, created_at desc);
create index if not exists idx_audit_log_action on public.audit_log(action, created_at desc);
create index if not exists idx_audit_log_created on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log super admin read" on public.audit_log;
create policy "audit_log super admin read" on public.audit_log
  for select to authenticated
  using (public.is_super_admin());

-- INSERTs go through service-role only (createAdminClient bypasses RLS), so
-- no INSERT policy is needed. UPDATE/DELETE intentionally have no policy →
-- nobody can mutate audit rows from the app.

-- ─── 5) impersonation_sessions table ──────────────────────────────
create table if not exists public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  super_admin_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active boolean not null default true,
  ip_address text,
  user_agent text
);

create index if not exists idx_impersonation_admin_active
  on public.impersonation_sessions (super_admin_user_id)
  where active = true;
create index if not exists idx_impersonation_target_active
  on public.impersonation_sessions (target_user_id)
  where active = true;

-- Enforce: only one active impersonation per super_admin at a time.
create unique index if not exists idx_impersonation_one_active_per_admin
  on public.impersonation_sessions (super_admin_user_id)
  where active = true;

alter table public.impersonation_sessions enable row level security;

drop policy if exists "impersonation_sessions super admin own" on public.impersonation_sessions;
create policy "impersonation_sessions super admin own"
  on public.impersonation_sessions
  for select to authenticated
  using (super_admin_user_id = auth.uid() and public.is_super_admin());

-- Mutations only via service-role (server actions). No INSERT/UPDATE/DELETE
-- policies → app code uses createAdminClient.

commit;
