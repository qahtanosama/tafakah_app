-- Migration A — Formalize catalog drift columns.
--
-- These columns currently exist in the live DB only because they were applied
-- at runtime via POST /api/admin/migrate-schema (the Supabase Management API).
-- That route is being deleted in the Supabase-only rebuild, so we capture the
-- same ALTERs here as a real, version-controlled migration.
--
-- Idempotent — safe to re-run (all `add column if not exists`).

begin;

-- ─── products ──────────────────────────────────────────────
alter table public.products
  add column if not exists default_nw        numeric(10,3) not null default 0,
  add column if not exists default_gw        numeric(10,3) not null default 0,
  add column if not exists default_price_mt  numeric(12,2) not null default 0,
  add column if not exists container_type    text          not null default '',
  add column if not exists notes             text          not null default '';

-- ─── buyers ────────────────────────────────────────────────
alter table public.buyers
  add column if not exists short_name        text not null default '',
  add column if not exists additional_number text not null default '',
  add column if not exists cc_email          text not null default '';

-- ─── sellers ───────────────────────────────────────────────
alter table public.sellers
  add column if not exists wechat_id text;

commit;
