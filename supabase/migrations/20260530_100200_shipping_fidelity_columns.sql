-- Migration C — Close the contract_shipping fidelity gap.
--
-- The localStorage ShippingEntry carries many fields the table never had:
-- booking ref, cutoff/loading dates, ports of loading/discharge, seal number,
-- notes, a 6-value statusOverride (incl. 'auto'/'cancelled'), and the ShipsGo
-- request id + last-auto-fetch timestamp. Without these, a Supabase-only read
-- path silently drops them. Add the columns, and widen the `status` check to
-- include 'cancelled' so it matches the app's ShippingStatus union.
--
-- RLS on contract_shipping (team full / client own) already scopes rows; new
-- columns inherit that scope, so no policy change is required. The existing
-- set_updated_at trigger already covers this table.
--
-- Idempotent — safe to re-run.

begin;

alter table public.contract_shipping
  add column if not exists booking_ref        text,
  add column if not exists cutoff_date        date,
  add column if not exists loading_date       date,
  add column if not exists port_of_loading    text,
  add column if not exists port_of_discharge  text,
  add column if not exists seal_number        text,
  add column if not exists notes              text,
  add column if not exists status_override    text,
  add column if not exists shipsgo_request_id text,
  add column if not exists last_auto_fetch_at timestamptz;

-- status_override check constraint (auto/pending/at_sea/delivered/delayed/cancelled).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contract_shipping_status_override_check'
  ) then
    alter table public.contract_shipping
      add constraint contract_shipping_status_override_check
      check (status_override in ('auto','pending','at_sea','delivered','delayed','cancelled'));
  end if;
end $$;

-- Widen the existing `status` check to include 'cancelled'.
alter table public.contract_shipping
  drop constraint if exists contract_shipping_status_check;
alter table public.contract_shipping
  add constraint contract_shipping_status_check
  check (status in ('pending','in-transit','delivered','delayed','cancelled'));

commit;
