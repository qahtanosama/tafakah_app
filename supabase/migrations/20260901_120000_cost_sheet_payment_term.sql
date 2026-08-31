-- Payment terms belong to the offer, so they are remembered with it.
--
-- The quote now states how the buyer pays — "30% advance, 70% after loading
-- the container" — and that choice belongs to this product's offer in this
-- market, the same way the route does. Storing it on the session means a
-- re-quote next week opens on the terms that were actually agreed rather than
-- reverting to a default nobody chose.
--
-- Empty string means "not chosen", which the calculator reads as its default
-- (see DEFAULT_PAYMENT_TERM_ID). Every existing row backfills to that, so a
-- sheet saved before this migration behaves exactly as it did.
--
-- Only the id is stored. The wording lives in src/lib/payment-terms.ts, in
-- three buyer languages — persisting the rendered sentence would freeze one
-- language into the row and drift the day the copy is corrected.

begin;

alter table public.product_cost_sheets
  add column if not exists payment_term text not null default '';

comment on column public.product_cost_sheets.payment_term is
  'PaymentTermId from src/lib/payment-terms.ts — e.g. "a30l70". Empty means '
  'not chosen; the calculator falls back to DEFAULT_PAYMENT_TERM_ID.';

commit;
