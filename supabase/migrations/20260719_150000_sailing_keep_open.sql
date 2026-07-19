-- Team booking override for sailing schedules.
--
-- The portal auto-hides booking once the cargo cut-off / ETD passes. The team
-- sometimes negotiates late gate-in with the carrier, so they need the final
-- say: keep_open = true keeps an 'open' sailing bookable past its deadline.
-- (Closing EARLY is already possible via status = 'closed'.)
--
-- Rides the existing RLS policies — team-only writes, clients read the flag.

alter table public.sailing_schedules
  add column if not exists keep_open boolean not null default false;
