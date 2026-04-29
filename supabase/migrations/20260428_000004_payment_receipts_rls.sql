-- Create bucket if not exists (in case it wasn't)
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do update set public = false;

-- Storage policies
create policy "Allow authenticated uploads to payment-receipts" on storage.objects
for insert to authenticated with check ( bucket_id = 'payment-receipts' );

create policy "Allow authenticated reads from payment-receipts" on storage.objects
for select to authenticated using ( bucket_id = 'payment-receipts' );

-- Table policies for payment_receipts
alter table if exists public.payment_receipts enable row level security;

-- Drop existing if they exist
drop policy if exists "Users can view their own payment receipts" on public.payment_receipts;
drop policy if exists "Users can upload payment receipts" on public.payment_receipts;

create policy "Users can view their own payment receipts" on public.payment_receipts
for select to authenticated
using (
  -- either it's an admin, or the user owns the contract
  exists (
    select 1 from public.contracts c
    join public.buyers b on b.id = c.buyer_id
    where c.id = payment_receipts.contract_id
    and (b.user_id = auth.uid() or auth.jwt()->>'role' = 'admin')
  )
);

create policy "Users can upload payment receipts" on public.payment_receipts
for insert to authenticated
with check (
  exists (
    select 1 from public.contracts c
    join public.buyers b on b.id = c.buyer_id
    where c.id = payment_receipts.contract_id
    and (b.user_id = auth.uid() or auth.jwt()->>'role' = 'admin')
  )
);
