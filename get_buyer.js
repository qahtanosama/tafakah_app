require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: buyer } = await supabase.from('buyers').select('company_name').eq('id', 'b4cbd76a-0265-4185-b266-82ae2b31e6c5').single();
  console.log("Buyer for 2026-GG7004:", buyer);
}
run();
