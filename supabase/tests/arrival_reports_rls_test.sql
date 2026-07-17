-- ============================================================================
-- RLS security test for contract_arrival_reports + arrival photo storage.
-- Designed for the Supabase SQL editor: every check writes a row into a temp
-- table and the FINAL statement is a SELECT, so the Results grid shows each
-- check's PASS/FAIL explicitly (RAISE NOTICE would only hit the Messages pane).
--
-- Why COMMIT (not ROLLBACK): a ROLLBACK would also discard the temp-table rows
-- we record, leaving the grid empty. So we run transactionally, DELETE every
-- seeded row before COMMIT (net effect = nothing persists), and the temp
-- results table (ON COMMIT PRESERVE ROWS) survives for the final SELECT.
--
-- Each check switches into the client's identity (role=authenticated + forged
-- jwt sub) for the RLS-sensitive operation, then resets to postgres to record
-- the outcome. Expected: every row says PASS, summary says ALL PASS.
-- ============================================================================

drop table if exists _rls_results;

begin;

-- --- idempotent pre-clean (in case a previous run aborted mid-way) ----------
delete from storage.objects
  where name like 'contracts/a1a1a1a1-%' or name like 'contracts/b1b1b1b1-%';
delete from public.contract_arrival_reports
  where contract_id in ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1');
delete from public.contracts
  where id in ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1');
delete from public.users_profile
  where user_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.buyers
  where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from auth.users
  where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

-- --- results table (survives COMMIT for the final SELECT) -------------------
create temp table _rls_results (
  step int,
  check_name text,
  expectation text,
  result text,
  detail text
) on commit preserve rows;

-- --- seed two separate client tenants (as postgres; RLS bypassed) -----------
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'rls-test-a@example.test'),
       ('22222222-2222-2222-2222-222222222222', 'rls-test-b@example.test');

insert into public.buyers (id, company_name, contact_name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RLS Test Buyer A', 'A'),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'RLS Test Buyer B', 'B');

insert into public.users_profile (user_id, role, buyer_id, is_active)
values ('11111111-1111-1111-1111-111111111111', 'client', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true),
       ('22222222-2222-2222-2222-222222222222', 'client', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

insert into public.contracts (id, contract_no, invoice_no, buyer_id, line_items, containers)
values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'RLS-TEST-A', 'RLS-INV-A',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '[]'::jsonb, '[{"number":"AAAA1111111"}]'::jsonb),
       ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'RLS-TEST-B', 'RLS-INV-B',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '[]'::jsonb, '[{"number":"BBBB2222222"}]'::jsonb);

-- pre-existing report + photo owned by client B (A must not see/touch these)
insert into public.contract_arrival_reports (id, contract_id, condition, comments, created_by)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
        'good', 'B private report', '22222222-2222-2222-2222-222222222222');

insert into storage.objects (id, bucket_id, name, owner)
values (gen_random_uuid(), 'contract-documents',
        'contracts/b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1/arrival/secret.jpg',
        '22222222-2222-2222-2222-222222222222');

-- jwt claim payloads reused below
-- A: {"sub":"1111...","role":"authenticated"}   B: {"sub":"2222...","role":"authenticated"}

-- ===== CHECK 1 — A inserts a report on OWN contract → ALLOW =================
do $$
declare ok boolean := false; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.contract_arrival_reports (contract_id, container_number, condition, created_by)
    values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'AAAA1111111', 'fair',
            '11111111-1111-1111-1111-111111111111');
    ok := true;
  exception when others then ok := false; msg := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_results values (1, 'A: INSERT report on OWN contract', 'ALLOW',
    case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'inserted' else 'blocked: ' || msg end);
end $$;

-- ===== CHECK 2 — A inserts on ANOTHER client's contract → DENY =============
do $$
declare denied boolean := false; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.contract_arrival_reports (contract_id, condition, created_by)
    values ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'poor',
            '11111111-1111-1111-1111-111111111111');
    denied := false;
  exception
    when insufficient_privilege then denied := true;
    when others then denied := false; msg := 'unexpected ' || sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_results values (2, 'A: INSERT on ANOTHER client''s contract', 'DENY',
    case when denied then 'PASS' else 'FAIL' end,
    case when denied then 'blocked (42501)'
         when msg <> '' then msg else 'INSERT SUCCEEDED — LEAK' end);
end $$;

-- ===== CHECK 3 — A forges created_by = client B → DENY =====================
do $$
declare denied boolean := false; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.contract_arrival_reports (contract_id, condition, created_by)
    values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'poor',
            '22222222-2222-2222-2222-222222222222');
    denied := false;
  exception
    when insufficient_privilege then denied := true;
    when others then denied := false; msg := 'unexpected ' || sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_results values (3, 'A: forge created_by = client B', 'DENY',
    case when denied then 'PASS' else 'FAIL' end,
    case when denied then 'blocked (42501)'
         when msg <> '' then msg else 'FORGED ROW ACCEPTED — LEAK' end);
end $$;

-- ===== CHECK 4 — A reads reports → only own, never B's =====================
do $$
declare n_total int := -1; n_foreign int := -1; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    select count(*) into n_total   from public.contract_arrival_reports;
    select count(*) into n_foreign from public.contract_arrival_reports
      where contract_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
  exception when others then msg := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_results values (4, 'A: READ reports (must not see B''s)', 'own only',
    case when msg = '' and n_foreign = 0 then 'PASS' else 'FAIL' end,
    case when msg <> '' then 'error: ' || msg
         else 'A sees ' || n_total || ' report(s); ' || n_foreign || ' of B''s' end);
end $$;

-- ===== CHECK 5 — A uploads a photo into OWN arrival folder → ALLOW =========
do $$
declare ok boolean := false; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into storage.objects (id, bucket_id, name, owner)
    values (gen_random_uuid(), 'contract-documents',
            'contracts/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1/arrival/mine.jpg',
            '11111111-1111-1111-1111-111111111111');
    ok := true;
  exception when others then ok := false; msg := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_results values (5, 'A: UPLOAD photo into OWN arrival folder', 'ALLOW',
    case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'uploaded' else 'blocked: ' || msg end);
end $$;

-- ===== CHECK 6 — A uploads into ANOTHER client's folder → DENY =============
do $$
declare denied boolean := false; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into storage.objects (id, bucket_id, name, owner)
    values (gen_random_uuid(), 'contract-documents',
            'contracts/b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1/arrival/evil.jpg',
            '11111111-1111-1111-1111-111111111111');
    denied := false;
  exception
    when insufficient_privilege then denied := true;
    when others then denied := false; msg := 'unexpected ' || sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_results values (6, 'A: UPLOAD into ANOTHER client''s folder', 'DENY',
    case when denied then 'PASS' else 'FAIL' end,
    case when denied then 'blocked (42501)'
         when msg <> '' then msg else 'UPLOAD SUCCEEDED — LEAK' end);
end $$;

-- ===== CHECK 7 — A uploads outside arrival/ (into certs/) → DENY ===========
do $$
declare denied boolean := false; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into storage.objects (id, bucket_id, name, owner)
    values (gen_random_uuid(), 'contract-documents',
            'contracts/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1/certs/forged.pdf',
            '11111111-1111-1111-1111-111111111111');
    denied := false;
  exception
    when insufficient_privilege then denied := true;
    when others then denied := false; msg := 'unexpected ' || sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_results values (7, 'A: UPLOAD outside arrival/ (certs/)', 'DENY',
    case when denied then 'PASS' else 'FAIL' end,
    case when denied then 'blocked (42501)'
         when msg <> '' then msg else 'WROTE INTO certs/ — LEAK' end);
end $$;

-- ===== CHECK 8 — A reads storage → must not see B's photo =================
do $$
declare n_foreign int := -1; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    select count(*) into n_foreign from storage.objects
      where name like 'contracts/b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1/%';
  exception when others then msg := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_results values (8, 'A: READ storage (must not see B''s photos)', 'own only',
    case when msg = '' and n_foreign = 0 then 'PASS' else 'FAIL' end,
    case when msg <> '' then 'error: ' || msg
         else n_foreign || ' of B''s photos visible' end);
end $$;

-- ===== CHECK 9 — B reads reports → must not see A's =======================
do $$
declare n_foreign int := -1; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  begin
    select count(*) into n_foreign from public.contract_arrival_reports
      where contract_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
  exception when others then msg := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_results values (9, 'B: READ reports (must not see A''s)', 'own only',
    case when msg = '' and n_foreign = 0 then 'PASS' else 'FAIL' end,
    case when msg <> '' then 'error: ' || msg
         else n_foreign || ' of A''s reports visible' end);
end $$;

-- --- delete every seeded row so COMMIT persists nothing ---------------------
delete from storage.objects
  where name like 'contracts/a1a1a1a1-%' or name like 'contracts/b1b1b1b1-%';
delete from public.contract_arrival_reports
  where contract_id in ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1');
delete from public.contracts
  where id in ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1');
delete from public.users_profile
  where user_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from public.buyers
  where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from auth.users
  where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

commit;

-- --- final statement: the Results grid --------------------------------------
select step as "#", check_name as "Check", expectation as "Expected",
       result as "Result", detail as "Detail"
from _rls_results
union all
select 99, '— SUMMARY —', '',
       case when (select count(*) from _rls_results where result <> 'PASS') = 0
            then 'ALL PASS' else 'FAILURES PRESENT' end,
       (select count(*) from _rls_results where result = 'PASS') || ' passed, ' ||
       (select count(*) from _rls_results where result <> 'PASS') || ' failed'
order by "#";
