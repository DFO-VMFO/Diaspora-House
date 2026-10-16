// Deployed to Supabase as `budget-notify` (verify_jwt = true).
// kind "submitted": any signed-in staff -> emails active CEOs. kind "decision": CEO only -> emails the submitter.
// The budget is read server-side from kv `ops:budgets`; the caller only names it.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const FROM = 'Diaspora House <requests@diasporafamilyoffice.com>';
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const money = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'sign in required' }, 401);
  const { data: prof } = await admin.from('staff_profiles').select('role,active').eq('user_id', u.user.id).maybeSingle();
  if (!prof || prof.active === false) return json({ error: 'not allowed' }, 403);
  let b: any; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const kind = b.kind === 'decision' ? 'decision' : 'submitted';
  if (kind === 'decision' && prof.role !== 'ceo') return json({ error: 'not allowed' }, 403);
  const { data: row } = await admin.from('kv').select('value').eq('key', 'ops:budgets').maybeSingle();
  const bud = (Array.isArray(row?.value) ? row!.value : []).find((x: any) => x?.id === b.budgetId);
  if (!bud) return json({ sent: 0, reason: 'budget_not_found' });
  let to: string[] = [];
  if (kind === 'submitted') {
    if (bud.status !== 'submitted') return json({ sent: 0, reason: 'not_submitted' });
    const { data: ceos } = await admin.from('staff_profiles').select('email').eq('role', 'ceo').neq('active', false);
    to = (ceos || []).map((c: any) => c.email);
  } else {
    if (!['approved', 'rejected'].includes(bud.status)) return json({ sent: 0, reason: 'no_decision' });
    to = [bud.submittedByEmail];
  }
  to = to.filter((e) => /^\S+@\S+\.\S+$/.test(e || '') && !/@example\.(com|org|net)$/i.test(e) && !/\.test$/i.test(e));
  if (!to.length) return json({ sent: 0, reason: 'no_recipient' });
  const { data: sec } = await admin.from('app_secrets').select('value').eq('name', 'resend_api_key').maybeSingle();
  if (!sec?.value) return json({ sent: 0, reason: 'email_not_configured' });
  const amount = money(kind === 'submitted' ? bud.requested : bud.approved);
  let subject: string, text: string;
  if (kind === 'submitted') {
    subject = `Budget awaiting your approval: ${bud.name}`;
    text = `${bud.submittedBy || 'A team member'} submitted "${bud.name}" for approval.\nRequested: ${amount}\n\nOpen the Ops Console, Budgets, to review and approve or send it back.`;
  } else {
    const d = bud.decision || {};
    subject = `Budget ${bud.status}: ${bud.name}`;
    text = bud.status === 'approved'
      ? `"${bud.name}" was approved for ${amount}.${d.note ? '\n\nNote: ' + d.note : ''}`
      : `"${bud.name}" was sent back and not approved.${d.note ? '\n\nReason: ' + d.note : ''}\n\nYou can revise it and submit it again.`;
  }
  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:auto;padding:28px;color:#1a1a1a"><p style="letter-spacing:.2em;font-size:11px;text-transform:uppercase;color:#8a6d2f">Diaspora House</p><p style="font-size:15px;line-height:1.55">${esc(text).replace(/\n/g, '<br>')}</p></div>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${sec.value}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to, subject, html, text }) });
  return json({ sent: r.ok ? to.length : 0, reason: r.ok ? undefined : 'send_failed' });
});
