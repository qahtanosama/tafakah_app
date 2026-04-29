require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: buyers } = await supabase.from('buyers').select('*').ilike('company_name', '%HOMAIZ%');
  if (!buyers || buyers.length === 0) { console.log("No buyer found"); return; }
  
  const buyerId = buyers[0].id;
  const { data: contracts } = await supabase.from('contracts').select('contract_no, current_stage').eq('buyer_id', buyerId);
  console.log("Contracts for buyer:", contracts);
}
run();
