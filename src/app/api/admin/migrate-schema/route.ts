import { NextResponse } from "next/server";

/**
 * POST /api/admin/migrate-schema
 *
 * Runs idempotent ALTER TABLE migrations against Supabase using the
 * Management API (service role key). Safe to run multiple times.
 */

const MIGRATIONS = [
  {
    name: "products: add default_nw, default_gw, default_price_mt, container_type, notes",
    sql: `ALTER TABLE products
      ADD COLUMN IF NOT EXISTS default_nw        numeric(10,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS default_gw        numeric(10,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS default_price_mt  numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS container_type    text          NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS notes             text          NOT NULL DEFAULT '';`,
  },
  {
    name: "buyers: add short_name, additional_number, cc_email",
    sql: `ALTER TABLE buyers
      ADD COLUMN IF NOT EXISTS short_name        text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS additional_number text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS cc_email          text NOT NULL DEFAULT '';`,
  },
  {
    name: "sellers: add wechat_id",
    sql: `ALTER TABLE sellers ADD COLUMN IF NOT EXISTS wechat_id text;`,
  },
];

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { success: false, error: "Supabase env vars not configured" },
      { status: 500 }
    );
  }

  // Extract the project ref from the URL: https://<ref>.supabase.co
  const ref = url.replace("https://", "").split(".")[0];

  const results: { name: string; status: "ok" | "error"; error?: string }[] = [];

  for (const migration of MIGRATIONS) {
    try {
      // Use the Supabase Management API to run raw SQL
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${ref}/database/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ query: migration.sql }),
        }
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      results.push({ name: migration.name, status: "ok" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: migration.name, status: "error", error: msg });
    }
  }

  const allOk = results.every((r) => r.status === "ok");
  return NextResponse.json({ success: allOk, results }, { status: allOk ? 200 : 207 });
}
