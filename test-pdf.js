const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data, error } = await sb.auth.signInWithPassword({ email: 'alsalam@tafakah.com', password: 'Password123!' });
  if (error) { console.error(error); return; }
  const token = data.session.access_token;
  // Get a contract for this user
  const { data: contracts } = await sb.from('contracts').select('id').limit(1);
  const contractId = contracts[0].id;
  
  // Use fetch to hit the local endpoint
  const res = await fetch(`http://localhost:3000/api/portal/generate-pdf?contractId=${contractId}&docType=ci`, {
    headers: { 'Cookie': `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token=${encodeURIComponent(JSON.stringify([data.session.access_token, data.session.refresh_token, null, null, null]))}` }
  });
  console.log(res.status, await res.text());
})();
