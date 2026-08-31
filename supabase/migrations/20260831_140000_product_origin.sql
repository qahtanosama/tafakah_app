-- Where a product actually comes from.
--
-- On a sea quote the origin is the loading port, because that is where the
-- goods are handed over: "FOB Shekou". Overland is different — the truck loads
-- at the packhouse, so the FCA named place is the producing town itself:
-- "FCA Anqiu", not "FCA Khorgos". Khorgos is a waypoint on the route, not the
-- place the seller's obligation ends.
--
-- That makes origin a property of the PRODUCT, not of the quote: ginger comes
-- from Anqiu whoever is buying it. Stored as free text ("Anqiu, Shandong")
-- rather than a picked place, because these are farm towns maintained per
-- product, not an enumerable list of ports. The quote prints the part before
-- the comma, so "Anqiu, Shandong" reads "FCA Anqiu".
--
-- Only overland markets use it; a Gulf quote keeps naming its loading port.

begin;

alter table public.products
  add column if not exists origin text not null default '';

comment on column public.products.origin is
  'Producing town/region, e.g. "Anqiu, Shandong". Used as the FCA named place '
  'on overland quotes; sea quotes name the loading port instead. The quote '
  'prints the part before the first comma.';

-- Known origins. Matched on the exact stored names; anything else stays blank
-- until the team fills it in on the Products page.
update public.products set origin = 'Anqiu, Shandong'
 where name in ('Fresh Ginger', 'Fresh Ginger Black Cat') and origin = '';

update public.products set origin = 'Jining, Shandong'
 where name in ('Fresh Garlic-Mesh', 'Fresh Garlic - Carton') and origin = '';

-- NOTE: Shaanxi (陕西), not Shanxi (山西) — Meixian and Zhouzhi in Shaanxi are
-- the kiwifruit belt. Correct on the Products page if this is the wrong one.
update public.products set origin = 'Shaanxi'
 where name = 'Fresh Kiwi' and origin = '';

commit;
