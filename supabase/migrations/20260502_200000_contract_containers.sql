-- Adds B/L number + container list directly to the contracts row.
-- These are the canonical "shipping documents" identifiers attached to the
-- contract itself (entered on the Shipping Tracker), and are rendered on the
-- CI / PL / CI-Customs PDFs and in the client portal.

alter table public.contracts
  add column if not exists bl_number text,
  add column if not exists containers jsonb not null default '[]'::jsonb;

-- Searching by B/L is useful for support / cross-referencing.
create index if not exists idx_contracts_bl_number
  on public.contracts(bl_number)
  where bl_number is not null;
