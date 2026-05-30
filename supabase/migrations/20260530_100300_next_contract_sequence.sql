-- Migration D — Race-safe contract numbering.
--
-- Replaces the client-side log-scan in getNextSequence() with a DB-side
-- computation, so two machines can't independently derive the same next
-- sequence. Contract numbers look like "YYYY-PREFIXseq" (e.g. 2026-GG7001).
--
-- Matches the legacy behaviour: when no contracts exist for (year, prefix),
-- the first sequence is 7001 (coalesce(max, 7000) + 1).
--
-- NOTE: the real collision guard is the existing `contracts.contract_no`
-- UNIQUE constraint — the submit action should still retry on conflict. This
-- function only computes the suggested next number.
--
-- Idempotent — `create or replace`.

create or replace function public.next_contract_sequence(p_year int, p_prefix text)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(seq), 7000) + 1
  from (
    select (m[3])::int as seq
    from public.contracts c
    cross join lateral regexp_match(c.contract_no, '^(\d{4})-([A-Z]+)(\d+)$') as m
    where m is not null
      and (m[1])::int = p_year
      and  m[2]       = p_prefix
  ) s;
$$;
