-- ============================================================================
-- RLS DELETE test for contract_arrival_reports + arrival photo storage.
-- Same grid-result harness as arrival_reports_rls_test.sql (final SELECT shows
-- PASS/FAIL; seed deleted before COMMIT so nothing persists).
--
-- NOTE: unlike INSERT (which raises 42501 on a WITH CHECK violation), a DELETE
-- blocked by RLS simply affects ZERO rows — no error. So these checks assert the
-- affected ROW_COUNT and confirm the other client's data SURVIVES.
--
-- Expected: every row PASS, summary ALL PASS.
-- ============================================================================

drop table if exists _rls_del_results;

begin;

-- --- idempotent pre-clean ---------------------------------------------------
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

create temp table _rls_del_results (
  step int, check_name text, expectation text, result text, detail text
) on commit preserve rows;

-- --- seed two tenants, each with one report + one arrival photo -------------
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'rls-del-a@example.test'),
       ('22222222-2222-2222-2222-222222222222', 'rls-del-b@example.test');

insert into public.buyers (id, company_name, contact_name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RLS Del Buyer A', 'A'),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'RLS Del Buyer B', 'B');

insert into public.users_profile (user_id, role, buyer_id, is_active)
values ('11111111-1111-1111-1111-111111111111', 'client', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true),
       ('22222222-2222-2222-2222-222222222222', 'client', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

insert into public.contracts (id, contract_no, invoice_no, buyer_id, line_items)
values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'RLS-DEL-A', 'RLS-DEL-INV-A',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '[]'::jsonb),
       ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'RLS-DEL-B', 'RLS-DEL-INV-B',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '[]'::jsonb);

-- report A (owned by client A) and report B (owned by client B)
insert into public.contract_arrival_reports (id, contract_id, condition, created_by)
values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
        'good', '11111111-1111-1111-1111-111111111111'),
       ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1',
        'good', '22222222-2222-2222-2222-222222222222');

insert into storage.objects (id, bucket_id, name, owner)
values (gen_random_uuid(), 'contract-documents',
        'contracts/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1/arrival/a.jpg',
        '11111111-1111-1111-1111-111111111111'),
       (gen_random_uuid(), 'contract-documents',
        'contracts/b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1/arrival/b.jpg',
        '22222222-2222-2222-2222-222222222222');

-- ===== CHECK 1 — A deletes OWN report → ALLOW (1 row) ======================
do $$
declare n int := -1; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    delete from public.contract_arrival_reports where id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
    get diagnostics n = row_count;
  exception when others then msg := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_del_results values (1, 'A: DELETE OWN report', 'ALLOW (1 row)',
    case when msg = '' and n = 1 then 'PASS' else 'FAIL' end,
    case when msg <> '' then 'error: ' || msg else n || ' row(s) deleted' end);
end $$;

-- ===== CHECK 2 — A deletes ANOTHER client's report → DENY (0 rows) =========
do $$
declare n int := -1; still int := -1; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    delete from public.contract_arrival_reports where id = 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2';
    get diagnostics n = row_count;
  exception when others then msg := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  select count(*) into still from public.contract_arrival_reports
    where id = 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2';
  insert into _rls_del_results values (2, 'A: DELETE ANOTHER client''s report', 'DENY (0 rows)',
    case when msg = '' and n = 0 and still = 1 then 'PASS' else 'FAIL' end,
    case when msg <> '' then 'error: ' || msg
         else n || ' row(s) deleted; B''s report still present = ' || still end);
end $$;

-- ===== CHECK 3 — A deletes OWN arrival photo → ALLOW (1 row) ===============
do $$
declare n int := -1; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    delete from storage.objects
      where name = 'contracts/a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1/arrival/a.jpg';
    get diagnostics n = row_count;
  exception when others then msg := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into _rls_del_results values (3, 'A: DELETE OWN arrival photo', 'ALLOW (1 row)',
    case when msg = '' and n = 1 then 'PASS' else 'FAIL' end,
    case when msg <> '' then 'error: ' || msg else n || ' object(s) deleted' end);
end $$;

-- ===== CHECK 4 — A deletes ANOTHER client's arrival photo → DENY (0 rows) ==
do $$
declare n int := -1; still int := -1; msg text := '';
begin
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    delete from storage.objects
      where name = 'contracts/b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1/arrival/b.jpg';
    get diagnostics n = row_count;
  exception when others then msg := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  select count(*) into still from storage.objects
    where name = 'contracts/b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1/arrival/b.jpg';
  insert into _rls_del_results values (4, 'A: DELETE ANOTHER client''s photo', 'DENY (0 rows)',
    case when msg = '' and n = 0 and still = 1 then 'PASS' else 'FAIL' end,
    case when msg <> '' then 'error: ' || msg
         else n || ' object(s) deleted; B''s photo still present = ' || still end);
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
from _rls_del_results
union all
select 99, '— SUMMARY —', '',
       case when (select count(*) from _rls_del_results where result <> 'PASS') = 0
            then 'ALL PASS' else 'FAILURES PRESENT' end,
       (select count(*) from _rls_del_results where result = 'PASS') || ' passed, ' ||
       (select count(*) from _rls_del_results where result <> 'PASS') || ' failed'
order by "#";
