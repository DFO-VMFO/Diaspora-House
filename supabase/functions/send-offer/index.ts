// Deployed to Supabase as `send-offer` (verify_jwt = true). CEO only. Emails a job offer to a provider through Resend.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const FROM = 'Diaspora House <requests@diasporafamilyoffice.com>';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'sign in required' }, 401);
  const { data: prof } = await admin.from('staff_profiles').select('role,active').eq('user_id', u.user.id).maybeSingle();
  if (!prof || prof.active === false || prof.role !== 'ceo') return json({ error: 'not allowed' }, 403);
  let b: any; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const to = String(b.to || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(to) || /@example\.(com|org|net)$/i.test(to)) return json({ delivered: false, reason: 'no_real_email' });
  const { data: sec } = await admin.from('app_secrets').select('value').eq('name', 'resend_api_key').maybeSingle();
  if (!sec?.value) return json({ delivered: false, reason: 'email_not_configured' });
  const subject = String(b.subject || 'New request from Diaspora House').slice(0, 200);
  const text = String(b.text || '').slice(0, 2000);
  const link = String(b.link || '');
  const okLink = /^https:\/\/\S+$/.test(link) ? link : '';
  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:auto;padding:28px;color:#1a1a1a"><p style="letter-spacing:.2em;font-size:11px;text-transform:uppercase;color:#8a6d2f">Diaspora House</p><p style="font-size:15px;line-height:1.55">${esc(text).replace(/\n/g, '<br>')}</p>${okLink ? `<p style="margin:22px 0"><a href="${okLink}" style="background:#1a1a1a;color:#fff;padding:12px 22px;text-decoration:none;font-size:14px;border-radius:4px">View and reply</a></p>` : ''}<p style="font-size:12px;color:#777">You are receiving this because you are a House service partner.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${sec.value}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [to], subject, html, text: text + (okLink ? `\n\nReply here: ${okLink}` : '') }) });
  if (!r.ok) return json({ delivered: false, reason: 'send_failed' });
  return json({ delivered: true });
});
