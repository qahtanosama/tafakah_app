-- Migration B — Close the contracts fidelity gap.
--
-- The localStorage ContractLogEntry carries a full SalesContractData
-- `masterSnapshot` (frozen seller/buyer text blocks, shipping ports, bank
-- details, document identifiers). The PDF renderers depend on that exact
-- point-in-time snapshot. The `contracts` table previously stored only
-- line_items / terms / totals + FKs, so those blocks would be lost on a
-- Supabase-only read path. We store the whole snapshot as jsonb to guarantee
-- PDFs render identically, while line_items/terms/totals remain the queryable
-- projection.
--
-- Also adds:
--   * product_label — denormalized first-product label for fast contract-log
--     list rendering (was ContractLogEntry.product).
--   * status — the business status (Active/Completed/Cancelled), distinct from
--     the workflow `current_stage`.
--
-- Idempotent — safe to re-run.

begin;

alter table public.contracts
  add column if not exists master_snapshot jsonb,
  add column if not exists product_label   text,
  add column if not exists status          text not null default 'Active';

-- Add the status check constraint only if it isn't already present.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contracts_status_check'
  ) then
    alter table public.contracts
      add constraint contracts_status_check
      check (status in ('Active', 'Completed', 'Cancelled'));
  end if;
end $$;

commit;
