-- What one unit of a product is called, and Arabic product names.
--
-- Garlic ships in mesh bags, not cartons, so a quote reading "11,600 cartons"
-- is wrong on a client-facing offer. The word belongs to the product's pack
-- format, next to how many of them fill a container.
--
-- Arabic singular is the right form for both languages here: English pluralises
-- with a trailing "s" (carton -> cartons, mesh bag -> mesh bags), and Arabic
-- takes the singular after any number from 11 up ("11,600 كيس شبكي"), which is
-- the only range these counts ever fall in.

begin;

alter table public.products
  add column if not exists pack_unit    text not null default 'carton',
  add column if not exists pack_unit_ar text not null default 'كرتون';

comment on column public.products.pack_unit is
  'Singular English noun for one unit of this pack format — "carton", "mesh bag". '
  'Quotes pluralise it with a trailing s.';

update public.products
   set pack_unit = 'mesh bag', pack_unit_ar = 'كيس شبكي'
 where name = 'Fresh Garlic-Mesh';

-- ─── Arabic product names ──────────────────────────────────
-- Without name_ar an Arabic quote prints the English name mid-sentence. The
-- legacy fallback map in lib/quote/quote-text.ts keys on "Fresh Garlic", which
-- matches neither garlic row, so both were falling through to Latin.
--
-- Only fills rows that are still blank, so anything the team has already
-- translated is left alone.
update public.products set name_ar = 'تفاح طازج'          where name = 'Fresh Apple'           and coalesce(name_ar, '') = '';
update public.products set name_ar = 'موز طازج'           where name = 'Fresh Banana'          and coalesce(name_ar, '') = '';
update public.products set name_ar = 'جزر طازج'           where name = 'FRESH CARROTS'         and coalesce(name_ar, '') = '';
update public.products set name_ar = 'ثوم طازج - كرتون'    where name = 'Fresh Garlic - Carton'  and coalesce(name_ar, '') = '';
update public.products set name_ar = 'ثوم طازج - شبك'      where name = 'Fresh Garlic-Mesh'      and coalesce(name_ar, '') = '';
update public.products set name_ar = 'زنجبيل طازج'        where name = 'Fresh Ginger'          and coalesce(name_ar, '') = '';
update public.products set name_ar = 'كيوي طازج'          where name = 'Fresh Kiwi'            and coalesce(name_ar, '') = '';
update public.products set name_ar = 'ليمون طازج'         where name = 'Fresh Lemon'           and coalesce(name_ar, '') = '';
update public.products set name_ar = 'ليمون بدون بذور'     where name = 'Seedless Lemon'        and coalesce(name_ar, '') = '';

commit;
