require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: profiles, error } = await supabase.from('users_profile').select('*, user_id').eq('role', 'client');
  if (error) { console.error("Error fetching profiles:", error); return; }
  
  if (profiles.length === 0) {
    console.log("No client profiles found. Creating one...");
    // Let's find a buyer
    const { data: buyers } = await supabase.from('buyers').select('*').limit(1);
    if (!buyers || buyers.length === 0) { console.log("No buyers in DB either. Please sync first."); return; }
    
    const email = "testclient@example.com";
    const password = "password123456";
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (authError) { console.error("Create user error:", authError); return; }
    
    const { error: profileError } = await supabase.from('users_profile').insert({
      user_id: authData.user.id,
      role: 'client',
      buyer_id: buyers[0].id,
      full_name: 'Test Client',
      is_active: true
    });
    if (profileError) { console.error("Profile error:", profileError); return; }
    console.log(`Created test client: ${email} / ${password}`);
  } else {
    // just change the password of the first one to something we know
    const userId = profiles[0].user_id;
    const email = "testclient@example.com";
    const password = "password123456";
    await supabase.auth.admin.updateUserById(userId, { email, password, email_confirm: true });
    console.log(`Updated existing client: ${email} / ${password} (Buyer ID: ${profiles[0].buyer_id})`);
  }
}
run();
