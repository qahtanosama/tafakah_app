-- Freight Invoice (FOB contracts) — post-shipment sea-freight billing.
--
-- Freight is new data entered ~7–10 days after the goods Commercial Invoice is
-- already finalized, so it lives on contract_shipping (NOT in master_snapshot).
-- The Freight Invoice total = freight_base + freight_additional, and its number
-- is computed as `${contracts.invoice_no}-FRT` (never stored).
--
-- RLS on contract_shipping already scopes rows (team full / client own); these
-- new columns inherit that scope, so no policy change is needed. The existing
-- set_updated_at trigger already covers this table.
--
-- Idempotent — safe to re-run.

begin;

alter table public.contract_shipping
  add column if not exists freight_base         numeric(12,2),
  add column if not exists freight_additional   numeric(12,2),
  add column if not exists freight_charge_label text,
  add column if not exists freight_invoice_date date,
  add column if not exists freight_notes        text;

commit;
