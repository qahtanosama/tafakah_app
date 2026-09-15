-- Widening the assistant: the sailing board, products, buyers and /master.
--
-- Same stance as 20260908_140000: she stays outside is_team() and is granted
-- back one table at a time, so anything added to the schema later is denied to
-- her until someone decides otherwise.
--
-- WHAT IS DELIBERATELY NOT HERE, and must not be "helpfully" added:
--   • product_cost_sheets    — farm price, margin_pct, quoted_per_mt. She can
--                              now reach /products/calculator, and it is meant
--                              to open BLANK for her: no saved session loads,
--                              history is empty, saves fail. useQuoteCalculator
--                              already handles that path (saveError) and keeps
--                              working on in-memory figures. That is the whole
--                              point — a usable tool that never discloses what
--                              anyone else paid.
--   • contract_finance       — payments received.
-- sailing_schedule_internal IS granted, unlike the two above. She runs the
-- sailing board outright, including importing the carrier's weekly sheet — and
-- that sheet is where ocean freight comes from. She opens the file to upload
-- it, so the rates are already in front of her; hiding the column in the app
-- would obstruct her without concealing anything. Same reasoning the original
-- assistant migration applied to contract sale prices.
--
-- Two things here DO reverse decisions taken in 20260908_140000, consciously:
--   1. That migration said "Contracts: read only. She never creates, edits or
--      deletes one." She now creates them, because /master's submit saves the
--      contract before it will generate anything. Editing and deleting stay
--      team-only (editContract / deleteContract keep requireTeamUser).
--   2. She gains buyer insert/update, because /master auto-creates a buyer on
--      submit when the name is not already known.
-- Neither discloses cost, margin or payments. This is a change of AUTHORITY,
-- not of visibility — a different axis from the one the role was built on.

begin;

-- ─── The sailing board ─────────────────────────────────────────────────────
-- Select only, even though she now manages the board completely. Every write
-- goes through a server action on the service-role client (all of lib/
-- schedules.ts is requireDocStaff), so an update policy would grant no
-- capability the app actually uses -- it would only add a direct REST write
-- path with her own token that nothing audits. Leaving it closed means
-- anything written with her token fails closed.
drop policy if exists "sailing_schedules assistant read" on public.sailing_schedules;
create policy "sailing_schedules assistant read" on public.sailing_schedules
  for select using (public.is_assistant());

-- Which buyer is on which sailing. She confirms, declines and marks them booked
-- through server actions; this policy is what lets her read them at all.
drop policy if exists "loading_plans assistant read" on public.loading_plans;
create policy "loading_plans assistant read" on public.loading_plans
  for select using (public.is_assistant());

-- Ocean freight, booking plan, space release, remark. Granted deliberately --
-- see the note at the top. updateSailing upserts this table on her behalf via
-- the service-role client, so select is all she needs here.
drop policy if exists "sailing_internal assistant read" on public.sailing_schedule_internal;
create policy "sailing_internal assistant read" on public.sailing_schedule_internal
  for select using (public.is_assistant());

-- ─── Buyers ────────────────────────────────────────────────────────────────
-- She already had select. /master creates a buyer on submit when the company
-- name is new, and the Buyers screen lets her correct an address on the
-- paperwork. No delete: removing a buyer is not paperwork.
drop policy if exists "buyers assistant insert" on public.buyers;
create policy "buyers assistant insert" on public.buyers
  for insert with check (public.is_assistant());

drop policy if exists "buyers assistant update" on public.buyers;
create policy "buyers assistant update" on public.buyers
  for update using (public.is_assistant()) with check (public.is_assistant());

-- ─── Products ──────────────────────────────────────────────────────────────
-- No new grant. She has had select since 20260908_140000, and products carries
-- default_price_mt — a SALE price, which she is already trusted with. She gets
-- no update: the calculator's debounced pack write-back is suppressed for her
-- in the UI, so nothing tries to write and then fails on every keystroke.

commit;
