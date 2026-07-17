-- Perf: stamp the three authz fields the request proxy needs (role, is_active,
-- preferred_language) into every access token, so src/proxy.ts can authorize
-- navigations by verifying the JWT locally instead of querying the database on
-- every request (2 sequential round trips to ap-southeast-1 today).
--
-- NOT ACTIVE until enabled in Dashboard → Authentication → Hooks →
-- "Customize Access Token (JWT) Claims" → public.custom_access_token_hook.
-- Until then (and for sessions issued before enabling) the proxy falls back to
-- its previous database lookup, so this is safe to apply at any time.
--
-- Freshness trade-off: role/is_active changes take effect at the next token
-- refresh rather than instantly. Server actions and /admin pages still check
-- the database directly; consider lowering the access-token TTL to ~15 min.

begin;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  prof record;
  claims jsonb;
begin
  select role, is_active, preferred_language
    into prof
    from public.users_profile
    where user_id = (event->>'user_id')::uuid;

  claims := coalesce(event->'claims', '{}'::jsonb);

  if found then
    claims := jsonb_set(claims, '{app_profile}', jsonb_build_object(
      'role', prof.role,
      'is_active', prof.is_active,
      'preferred_language', prof.preferred_language));
  else
    -- Auth user with no profile row: same "no profile" treatment the proxy
    -- already applies (signed out with the account-disabled message).
    claims := jsonb_set(claims, '{app_profile}', jsonb_build_object(
      'role', null, 'is_active', false, 'preferred_language', null));
  end if;

  return jsonb_set(event, '{claims}', claims);
exception when others then
  -- Never block token issuance: on any failure return the event unchanged.
  -- The proxy treats a missing app_profile claim as "fall back to the DB".
  return event;
end;
$$;

-- The Auth service invokes hooks as supabase_auth_admin; nobody else may call
-- or piggyback on this function.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- users_profile has RLS enabled; give the auth service a read-only path.
grant select on public.users_profile to supabase_auth_admin;
drop policy if exists "users_profile auth admin read" on public.users_profile;
create policy "users_profile auth admin read" on public.users_profile
  as permissive for select
  to supabase_auth_admin
  using (true);

commit;
