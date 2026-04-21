-- Initial schema for TAFAKAH
-- Run this FIRST in the Supabase SQL editor, then run 20260421_000002_rls.sql.
-- Tables created:
--   buyers, sellers, products, users_profile,
--   contracts, contract_finance, contract_shipping, contract_documents

begin;

-- ─── buyers ────────────────────────────────────────────────
create table public.buyers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  company_name_cn text,
  contact_name text not null,
  whatsapp_number text,
  phone_number text,
  email text,
  preferred_language text check (preferred_language in ('en','ar','zh')),
  country text,
  city text,
  address text,
  default_doc_preset text check (default_doc_preset in ('buyer','bank','customs','all')),
  custom_message_template jsonb,
  portal_enabled boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── sellers ───────────────────────────────────────────────
create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  company_name_cn text,
  contact_name text not null,
  contact_title text,
  whatsapp_number text,
  phone_number text,
  email text,
  preferred_language text check (preferred_language in ('en','ar','zh')),
  country text not null,
  city text,
  address text,
  products uuid[] not null default '{}',
  payment_terms text,
  lead_time_days int,
  bank_details jsonb,
  custom_message_template jsonb,
  default_doc_preset text check (default_doc_preset in ('factory','all')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── products ──────────────────────────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  name_zh text,
  prefix text not null unique,
  hs_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── users_profile (created after buyers so the FK resolves) ─
create table public.users_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('team', 'client')),
  full_name text,
  buyer_id uuid references public.buyers(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── contracts ─────────────────────────────────────────────
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_no text not null unique,
  invoice_no text not null unique,
  buyer_id uuid references public.buyers(id) on delete set null,
  seller_id uuid references public.sellers(id) on delete set null,
  contract_date date,
  line_items jsonb not null,
  terms jsonb,
  totals jsonb,
  current_stage text not null default 'docs-generated'
    check (current_stage in ('costed','docs-generated','sent-to-factory','sc-sent-to-buyer','shipped','certs-ready','delivered')),
  workflow_history jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── contract_finance ──────────────────────────────────────
create table public.contract_finance (
  contract_id uuid primary key references public.contracts(id) on delete cascade,
  cost_items jsonb not null default '[]',
  payments_received jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ─── contract_shipping ─────────────────────────────────────
create table public.contract_shipping (
  contract_id uuid primary key references public.contracts(id) on delete cascade,
  etd date,
  atd date,
  eta date,
  ata date,
  carrier text,
  vessel text,
  voyage text,
  bl_number text,
  container_numbers text[],
  shipsgo_data jsonb,
  status text check (status in ('pending','in-transit','delivered','delayed')),
  updated_at timestamptz not null default now()
);

-- ─── contract_documents (metadata only) ────────────────────
create table public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  doc_type text not null check (doc_type in ('sc','ci','ci-customs','pl','co','health','phyto','bl','other')),
  file_name text not null,
  file_size int,
  storage_path text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id),
  unique (contract_id, doc_type)
);

-- ─── Indexes ───────────────────────────────────────────────
create index idx_contracts_buyer on public.contracts(buyer_id);
create index idx_contracts_seller on public.contracts(seller_id);
create index idx_contracts_stage on public.contracts(current_stage);
create index idx_users_profile_role on public.users_profile(role);
create index idx_users_profile_buyer on public.users_profile(buyer_id);

-- ─── updated_at trigger function ───────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_buyers_updated_at            before update on public.buyers            for each row execute function public.set_updated_at();
create trigger trg_sellers_updated_at           before update on public.sellers           for each row execute function public.set_updated_at();
create trigger trg_products_updated_at          before update on public.products          for each row execute function public.set_updated_at();
create trigger trg_contracts_updated_at         before update on public.contracts         for each row execute function public.set_updated_at();
create trigger trg_contract_finance_updated_at  before update on public.contract_finance  for each row execute function public.set_updated_at();
create trigger trg_contract_shipping_updated_at before update on public.contract_shipping for each row execute function public.set_updated_at();
create trigger trg_users_profile_updated_at     before update on public.users_profile     for each row execute function public.set_updated_at();

commit;
