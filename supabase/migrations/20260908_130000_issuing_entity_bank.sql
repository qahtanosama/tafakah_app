-- Each company's own bank account, and the second entity.
--
-- Split out of …_issuing_entities.sql rather than folded into it, because that
-- migration had already been run. Editing an applied migration means the file
-- no longer describes what is in the database, and anyone who ran the earlier
-- version silently never gets the change.
--
-- Idempotent both ways: safe on a database that ran the first migration, and a
-- no-op on a fresh one where these values were already seeded.
--
-- Why the bank block hangs off the entity rather than sitting global: both
-- companies bank at Zhejiang Chouzhou under the same SWIFT, and their account
-- numbers differ only in the middle. Invoicing as one company while asking for
-- payment into the other's account is a mistake that is hard to spot and
-- expensive to unwind, so the account follows the company automatically.
--
-- Shape matches BankDetails in types/sales-contract.ts, which is what the
-- contract already prints:
--   { swift, beneficiary, account, bank, bankAddress, postCode }

begin;

alter table public.issuing_entities
  add column if not exists bank jsonb not null default '{}'::jsonb;

comment on column public.issuing_entities.bank is
  'Where the buyer pays this company. Same shape as BankDetails in '
  'types/sales-contract.ts. Set on the contract when this entity is chosen.';

-- Backfill the founding entity from getDefaultContractData().bank, unchanged.
-- Guarded on emptiness so a hand-edited account is never overwritten.
update public.issuing_entities
   set bank = '{"swift": "CZCBCN2X",
                "beneficiary": "TAFAKAH Food (Shanghai) CO., LTD",
                "account": "56512142010360000033",
                "bank": "Zhejiang Chouzhou Commercial Bank Co., Ltd",
                "bankAddress": "Yiwu Leyuan East Jiangbin Road, Yiwu, Zhejiang, China",
                "postCode": "322100"}'::jsonb
 where legal_name = 'TAFAKAH Food (SHANGHAI) CO., LTD'
   and coalesce(bank, '{}'::jsonb) = '{}'::jsonb;

-- ─── the second entity ─────────────────────────────────────────────────────
-- No Chinese name and no logo were supplied; both are left empty and can be
-- filled in on /entities. Letterhead omits the Chinese line and the logo when
-- they are blank, so the header renders correctly either way.
insert into public.issuing_entities
  (name, name_cn, address_lines, legal_name, legal_address, tel, email, bank, logo_url, is_default, sort_order)
select
  'Dar Chang (Shanghai) Co., Ltd',
  null,
  '["Building C, No. 888 Huanhu West Second Road,", "Lingang New Area,", "China (Shanghai) Pilot Free Trade Zone"]'::jsonb,
  'DAR CHANG (SHANGHAI) CO., LTD',
  'BUILDING C, NO. 888 HUANHU WEST SECOND ROAD, LINGANG NEW AREA, CHINA (SHANGHAI) PILOT FREE TRADE ZONE',
  '+86 188 1666 0573',
  'Info@taifukai.com',
  '{"swift": "CZCBCN2X",
    "beneficiary": "Dar Chang (Shanghai) Co., Ltd",
    "account": "56512020010090000567",
    "bank": "Zhejiang Chouzhou Commercial Bank Co., Ltd",
    "bankAddress": "Yiwu Leyuan East Jiangbin Road, Yiwu, Zhejiang, China",
    "postCode": "322100"}'::jsonb,
  '',
  false,
  1
where not exists (
  select 1 from public.issuing_entities where legal_name = 'DAR CHANG (SHANGHAI) CO., LTD'
);

commit;
