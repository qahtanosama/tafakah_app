-- Cost-item currency (USD/RMB) + per-contract RMB→USD rate.
--
-- Safety: every existing cost item is USD, so we backfill `currency:"USD"` onto
-- any item that lacks it. Existing totals/profit are unchanged. The new
-- rmb_usd_rate column is nullable (NULL = no RMB costs / not yet entered).
--
-- Idempotent: re-running only touches rows/items still missing `currency`.

begin;

-- 1) One RMB→USD rate per contract (¥ per $1). Nullable.
alter table public.contract_finance
  add column if not exists rmb_usd_rate numeric;

-- 2) Backfill currency = 'USD' on every existing cost item without one.
update public.contract_finance
set cost_items = (
  select coalesce(
    jsonb_agg(
      case
        when item ? 'currency' then item
        else item || '{"currency":"USD"}'::jsonb
      end
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(cost_items) as item
)
where jsonb_typeof(cost_items) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(cost_items) as it
    where not (it ? 'currency')
  );

commit;
