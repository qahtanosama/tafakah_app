// Background auto-sync — DISABLED (interim kill-switch ahead of Batch 4).
//
// This used to debounce every localStorage write and push ALL domains to
// Supabase via runMigration(). That migration writer (admin/migrate/actions.ts)
// predates the `master_snapshot` / `product_label` / `status` columns, so it
// inserted column-incomplete contract rows — which surface as empty "shells"
// now that the UI reads contracts from Supabase (Batch 3.2).
//
// It is also fully redundant: Buyers/Sellers/Products are Supabase-only
// (Batch 3.1) and Contracts/Finance/Shipping write to Supabase directly via
// src/lib/data/* (Batch 3.2–3.6). The whole migration system is removed in
// Batch 4; this no-op stops the shell regeneration now.
export function triggerBackgroundSync(): void {
  // no-op — see note above.
}
