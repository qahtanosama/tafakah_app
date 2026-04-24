import { createClient } from "@supabase/supabase-js";

const url = "https://ejgxcviblqbczpjxigsb.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZ3hjdmlibHFiY3pwanhpZ3NiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc3MjAyMiwiZXhwIjoyMDkyMzQ4MDIyfQ.zBaxs3Zh-22gGRygO6D2DgNf1Hgh1_7ugLf03hOlXto";

const supabase = createClient(url, key);

async function main() {
  const row = {
    id: "f3c8b417-6b2c-4654-8e5b-3b3b3b3b3b3b",
    name: "Test Insert",
    prefix: "TST",
    hs_code: "123456",
    default_nw: 10,
    default_gw: 11,
    default_price_mt: 100,
    container_type: "Test",
    notes: "Test"
  };

  console.log("Attempting to insert...");
  const { data, error } = await supabase.from("products").insert(row).select().single();
  
  if (error) {
    console.error("ERROR:", error);
  } else {
    console.log("SUCCESS:", data);
  }
}

main();
