import fetch from "node-fetch";

const url = "https://ejgxcviblqbczpjxigsb.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZ3hjdmlibHFiY3pwanhpZ3NiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc3MjAyMiwiZXhwIjoyMDkyMzQ4MDIyfQ.zBaxs3Zh-22gGRygO6D2DgNf1Hgh1_7ugLf03hOlXto";

const ref = "ejgxcviblqbczpjxigsb";

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

async function main() {
  for (const migration of MIGRATIONS) {
    console.log("Running:", migration.name);
    try {
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
      console.log("SUCCESS");
    } catch (err) {
      console.error("ERROR:", err.message);
    }
  }
}

main();
