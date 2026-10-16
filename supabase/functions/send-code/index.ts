// Deployed to Supabase as `send-code` (verify_jwt = false). Emails a 6-digit sign-in code through Resend.
// The Resend key lives in the private `app_secrets` table (service role only), never in this repo.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const FROM = 'Diaspora House <signin@diasporafamilyoffice.com>';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let email = '';
  try { email = String((await req.json()).email || '').trim().toLowerCase(); } catch { return json({ error: 'bad request' }, 400); }
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'bad email' }, 400);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const ok = () => json({ ok: true });
  const since = new Date(Date.now() - 10 * 60000).toISOString();
  const { count } = await admin.from('signin_attempts').select('id', { count: 'exact', head: true }).eq('email', email).gte('at', since);
  if ((count ?? 0) >= 4) return json({ error: 'too many codes' }, 429);
  await admin.from('signin_attempts').insert({ email });
  const { data: prof } = await admin.from('staff_profiles').select('active').eq('email', email).maybeSingle();
  if (!prof || prof.active === false) return ok();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const code = data?.properties?.email_otp;
  if (error || !code) return json({ error: 'could not create code' }, 500);
  const { data: sec } = await admin.from('app_secrets').select('value').eq('name', 'resend_api_key').maybeSingle();
  if (!sec?.value) return json({ error: 'email not configured' }, 500);
  const html = `<div style="font-family:Georgia,serif;max-width:420px;margin:auto;padding:28px;color:#1a1a1a"><p style="letter-spacing:.2em;font-size:11px;text-transform:uppercase;color:#8a6d2f">Diaspora House</p><p style="font-size:15px">Your sign-in code:</p><p style="font-size:34px;letter-spacing:.35em;font-weight:bold;margin:10px 0">${code}</p><p style="font-size:12.5px;color:#666">It works once and expires in about an hour. If you did not ask for it, ignore this email.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${sec.value}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [email], subject: `Your House sign-in code: ${code}`, html, text: `Your Diaspora House sign-in code: ${code}` }) });
  if (!r.ok) return json({ error: 'could not send email' }, 502);
  return ok();
});
