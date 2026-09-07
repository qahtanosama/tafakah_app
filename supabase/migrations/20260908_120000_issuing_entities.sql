-- The company whose name is on the document.
--
-- Every PDF letterhead has said "TAFAKAH Food (Shanghai) Co., Ltd." because
-- the component had it typed in as a literal — English name, Chinese name and
-- three address lines, with no way to say anything else. A second legal entity
-- means that block has to become data.
--
-- Two things are deliberately kept apart on this row:
--
--   • name / name_cn / address_lines  — the LETTERHEAD, in title case, as the
--     header is laid out: a left block, a Chinese line, a right-aligned address.
--   • legal_name / legal_address      — the CONTRACT BODY and signature block,
--     in the uppercase house style those clauses already use.
--
-- They are the same company written two ways, and both forms already exist in
-- the codebase (Letterhead.tsx title case, getDefaultContractData() uppercase).
-- Storing both is what lets a document look unchanged while the source moves
-- from a literal to a row.
--
-- NOT the `sellers` table. That holds upstream factories we buy from — Li,
-- Tianshun — with the products they supply and their lead times. This is who
-- SELLS to the buyer, which on a commercial invoice is us.

begin;

create table if not exists public.issuing_entities (
  id uuid primary key default gen_random_uuid(),

  -- Letterhead.
  name          text not null,
  name_cn       text,
  -- One string per printed line, right-aligned in the header's right block.
  -- An array rather than one blob because the header breaks lines by design,
  -- not by wrapping — see Letterhead.tsx.
  address_lines jsonb not null default '[]'::jsonb,

  -- Contract body and signature block.
  legal_name    text not null,
  legal_address text not null,
  tel           text not null default '',
  email         text not null default '',

  -- Where the buyer pays. Same shape as BankDetails in types/sales-contract.ts,
  -- which is what the contract already prints:
  --   { swift, beneficiary, account, bank, bankAddress, postCode }
  --
  -- Per entity, not global. Each company banks under its own account, and
  -- invoicing as one company while asking for payment into another's account
  -- is the kind of error that costs a shipment. Picking an entity on Master
  -- Data sets this block along with the letterhead.
  bank          jsonb not null default '{}'::jsonb,

  -- Either a path under /public ("/logo.png") or a full URL from the
  -- entity-assets bucket. Letterhead resolves both — see resolveAsset().
  logo_url      text not null default '',
  stamp_url     text not null default '',

  -- Exactly one row is the default; every document falls back to it, so
  -- nothing changes until a document is explicitly pointed elsewhere.
  is_default    boolean not null default false,
  sort_order    integer not null default 0,

  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one default. A partial unique index rather than a constraint,
-- because the rule is about the `true` rows only.
create unique index if not exists idx_issuing_entities_one_default
  on public.issuing_entities(is_default) where is_default;

create index if not exists idx_issuing_entities_order
  on public.issuing_entities(sort_order, name);

alter table public.issuing_entities enable row level security;

-- Team-only. A client has no business editing whose name is on the contract.
create policy "issuing_entities team full" on public.issuing_entities
  for all using (public.is_team()) with check (public.is_team());

create trigger trg_issuing_entities_updated_at
  before update on public.issuing_entities
  for each row execute function public.set_updated_at();

-- ─── the entity every existing document already carries ────────────────────
-- Values copied EXACTLY from Letterhead.tsx and getDefaultContractData(), so
-- reading the header from this row reproduces today's output character for
-- character. src/lib/issuing-entities.test.ts pins that.
insert into public.issuing_entities
  (name, name_cn, address_lines, legal_name, legal_address, tel, email, bank, logo_url, is_default, sort_order)
select
  'TAFAKAH Food (Shanghai) Co., Ltd.',
  '泰福凯食品贸易（上海）有限公司',
  '["Room 116, Building 1,", "258-288 Youdong Road,", "Minhang District, Shanghai, China"]'::jsonb,
  'TAFAKAH Food (SHANGHAI) CO., LTD',
  'ROOM 116, BUILDING 1, 258-288 YOUDONG ROAD, MINHANG DISTRICT, SHANGHAI, CHINA',
  '+86 187 2116 0270',
  'Info@taifukai.com',
  -- Copied from getDefaultContractData().bank, unchanged.
  '{"swift": "CZCBCN2X",
    "beneficiary": "TAFAKAH Food (Shanghai) CO., LTD",
    "account": "56512142010360000033",
    "bank": "Zhejiang Chouzhou Commercial Bank Co., Ltd",
    "bankAddress": "Yiwu Leyuan East Jiangbin Road, Yiwu, Zhejiang, China",
    "postCode": "322100"}'::jsonb,
  '/logo.png',
  true,
  0
where not exists (select 1 from public.issuing_entities);

-- ─── the second entity ─────────────────────────────────────────────────────
-- Same bank and SWIFT as TAFAKAH, a DIFFERENT account number — which is
-- exactly why the bank block hangs off the entity rather than sitting global.
--
-- No Chinese name and no logo were supplied; both are left empty and can be
-- filled in on /entities. Letterhead simply omits the Chinese line and the
-- logo when they are blank, so the header renders correctly either way.
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
where not exists (select 1 from public.issuing_entities where legal_name = 'DAR CHANG (SHANGHAI) CO., LTD');

-- ─── logo / stamp uploads ──────────────────────────────────────────────────
-- Public bucket: a letterhead logo is printed on documents that go to buyers
-- and customs, so there is nothing to protect, and react-pdf has to fetch it
-- without a session when rendering server-side.
insert into storage.buckets (id, name, public)
values ('entity-assets', 'entity-assets', true)
on conflict (id) do nothing;

drop policy if exists "entity assets public read" on storage.objects;
create policy "entity assets public read" on storage.objects
  for select using (bucket_id = 'entity-assets');

drop policy if exists "entity assets team write" on storage.objects;
create policy "entity assets team write" on storage.objects
  for all using (bucket_id = 'entity-assets' and public.is_team())
  with check (bucket_id = 'entity-assets' and public.is_team());

commit;
