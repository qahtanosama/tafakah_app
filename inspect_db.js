require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: buyers } = await supabase.from('buyers').select('id, company_name');
  const { data: contracts } = await supabase.from('contracts').select('contract_no, buyer_id');
  
  console.log("BUYERS IN DB:");
  console.table(buyers);
  
  console.log("CONTRACTS IN DB:");
  console.table(contracts);
}
run();
