# Supabase migrations

These SQL files must be run **manually** in the Supabase dashboard. The app does not apply them automatically.

## Order

1. `migrations/20260421_000001_initial_schema.sql` — tables, indexes, triggers
2. `migrations/20260421_000002_rls.sql` — RLS helpers + policies

## How to run

1. Open the [Supabase dashboard](https://supabase.com/dashboard) for your project.
2. Go to **SQL Editor → New Query**.
3. Open `migrations/20260421_000001_initial_schema.sql` in your editor, copy the full contents, paste into the SQL Editor, and click **Run**.
4. Confirm the green success message (no errors).
5. Repeat with `migrations/20260421_000002_rls.sql`.

## Verify

- **Database → Tables** should show 8 tables: `buyers`, `sellers`, `products`, `users_profile`, `contracts`, `contract_finance`, `contract_shipping`, `contract_documents`.
- **Authentication → Policies** should show RLS enabled on all 8 tables with the named policies applied.

## Notes

- The `users_profile.buyer_id` FK resolves correctly because `buyers` is created earlier in the same migration file.
- RLS exposes `contract_finance` rows to the linked client. The **app layer** is responsible for stripping `cost_items` before sending responses to client users — RLS itself is row-level, not column-level.
- Clients cannot see `sellers` at all and cannot see `contract_documents` of type `ci-customs`.

## Regenerating TypeScript types

After any schema change, run:

```bash
npm run types:supabase
```

Replace `YOUR_PROJECT_ID` in `package.json` with the project ref from your Supabase URL (the subdomain before `.supabase.co`). The Supabase CLI must be installed and authenticated.
