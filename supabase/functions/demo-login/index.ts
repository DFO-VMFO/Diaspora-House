// Deployed to Supabase as `demo-login` (verify_jwt = false). See README.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (Deno.env.get('DEMO_LOGIN') === 'off') return json({ error: 'demo sign-in is off' }, 403);
  let email = '';
  try { email = String((await req.json()).email || '').trim().toLowerCase(); } catch { return json({ error: 'bad request' }, 400); }
  if (!email.endsWith('@house.diaspora.test')) return json({ error: 'not a demo account' }, 403);
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: prof } = await admin.from('staff_profiles').select('role,active').eq('email', email).maybeSingle();
  if (!prof || prof.active === false) return json({ error: 'not a demo account' }, 403);
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) return json({ error: 'could not start demo session' }, 500);
  const r = await fetch(`${url}/auth/v1/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_ANON_KEY')! }, body: JSON.stringify({ type: 'magiclink', token_hash: data.properties.hashed_token }) });
  const body = await r.json();
  if (!r.ok) return json({ error: 'could not start demo session' }, 500);
  return json(body);
});
