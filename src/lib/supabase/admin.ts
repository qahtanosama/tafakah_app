import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS.
 * **Only** import from Route Handlers and Server Actions — never from Client Components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — refusing to create admin client");
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
