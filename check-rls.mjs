import fetch from "node-fetch";

const url = "https://ejgxcviblqbczpjxigsb.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZ3hjdmlibHFiY3pwanhpZ3NiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc3MjAyMiwiZXhwIjoyMDkyMzQ4MDIyfQ.zBaxs3Zh-22gGRygO6D2DgNf1Hgh1_7ugLf03hOlXto";

const ref = "ejgxcviblqbczpjxigsb";

async function main() {
  const sql = `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`;
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    console.log(await res.json());
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}

main();
