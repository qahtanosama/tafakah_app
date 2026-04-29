require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: buyers, error: buyerError } = await supabase.from('buyers').select('*');
  if (buyerError) { console.error("Buyer Error:", buyerError); return; }
  
  if (buyers.length === 0) { console.log("No buyers in DB"); return; }
  
  // Find "AL HOMAIZ" or similar
  const actualBuyer = buyers.find(b => b.company_name.toUpperCase().includes("HOMAIZ")) || buyers[buyers.length - 1];
  console.log("Assigning to buyer:", actualBuyer.company_name);
  
  const { data: profiles, error: profileError } = await supabase.from('users_profile').select('*').eq('role', 'client');
  if (profileError || profiles.length === 0) { console.error("No client profiles found"); return; }
  
  const userId = profiles[0].user_id;
  const { error: updateError } = await supabase.from('users_profile').update({ buyer_id: actualBuyer.id }).eq('user_id', userId);
  if (updateError) { console.error("Update Error:", updateError); return; }
  
  console.log("Successfully assigned the test client to:", actualBuyer.company_name);
}
run();
