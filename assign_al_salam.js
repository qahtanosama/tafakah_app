require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const buyerId = 'b4cbd76a-0265-4185-b266-82ae2b31e6c5'; // AL SALAM PLUS TRADING COMPANY
  
  const { data: profiles } = await supabase.from('users_profile').select('*').eq('role', 'client');
  if (profiles && profiles.length > 0) {
    const userId = profiles[0].user_id;
    await supabase.auth.admin.updateUserById(userId, { email: 'alsalam@tafakah.com', password: 'Password123!', email_confirm: true });
    await supabase.from('users_profile').update({ buyer_id: buyerId }).eq('user_id', userId);
    console.log("Test client updated to AL SALAM.");
    console.log("Email: alsalam@tafakah.com");
    console.log("Password: Password123!");
  }
}
run();
