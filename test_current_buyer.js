require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Find a buyer that actually has contracts!
  const { data: contracts, error: contractErr } = await supabase.from('contracts').select('contract_no, buyer_id');
  if (contractErr) { console.error("Contract Error:", contractErr); return; }
  
  if (!contracts || contracts.length === 0) {
    console.log("No contracts found in the cloud DB. You need to run the migration first!");
    return;
  }
  
  const targetBuyerId = contracts[0].buyer_id;
  const { data: buyer, error: buyerErr } = await supabase.from('buyers').select('*').eq('id', targetBuyerId).single();
  
  if (buyerErr || !buyer) {
    console.log("Found contract but no matching buyer in DB.");
    return;
  }
  
  // Now let's create or update a client login for this buyer
  const email = "democlient@tafakah.com";
  const password = "SecurePassword123!";
  
  const { data: profiles } = await supabase.from('users_profile').select('*').eq('role', 'client');
  let userId;
  
  if (profiles && profiles.length > 0) {
    userId = profiles[0].user_id;
    await supabase.auth.admin.updateUserById(userId, { email, password, email_confirm: true });
    await supabase.from('users_profile').update({ buyer_id: targetBuyerId }).eq('user_id', userId);
    console.log(`UPDATED existing test client.`);
  } else {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (authError) { console.error("Create user error:", authError); return; }
    userId = authData.user.id;
    await supabase.from('users_profile').insert({
      user_id: userId,
      role: 'client',
      buyer_id: targetBuyerId,
      full_name: buyer.company_name,
      is_active: true
    });
    console.log(`CREATED new test client.`);
  }
  
  console.log(`\n=== TEST CLIENT READY ===`);
  console.log(`Buyer Company: ${buyer.company_name}`);
  console.log(`Contracts Synced: ${contracts.filter(c => c.buyer_id === targetBuyerId).map(c => c.contract_no).join(", ")}`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`==========================\n`);
}
run();
