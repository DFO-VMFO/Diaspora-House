// Deployed to Supabase as `expiry-reminders` (verify_jwt = false, guarded by the x-cron-key header). Run daily by pg_cron.
// Emails providers and a digest to active CEO staff when a compliance document is 30/14/7/3 days from expiring, due today, or expired.
import { createClient } from 'npm:@supabase/supabase-js@2';
const FROM = 'Diaspora House <compliance@diasporafamilyoffice.com>';
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const real = (e: string) => /^\S+@\S+\.\S+$/.test(e || '') && !/@example\.(com|org|net)$/i.test(e);
const bucketOf = (days: number) => days < 0 ? -1 : days === 0 ? 0 : days <= 3 ? 3 : days <= 7 ? 7 : days <= 14 ? 14 : days <= 30 ? 30 : null;
Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: ck } = await admin.from('app_secrets').select('value').eq('name', 'cron_key').maybeSingle();
  if (!ck?.value || req.headers.get('x-cron-key') !== ck.value) return new Response('forbidden', { status: 403 });
  const { data: key } = await admin.from('app_secrets').select('value').eq('name', 'resend_api_key').maybeSingle();
  if (!key?.value) return new Response(JSON.stringify({ error: 'email not configured' }), { status: 500 });
  const { data: pr } = await admin.from('kv').select('value').eq('key', 'ops:providers').maybeSingle();
  const providers: any[] = Array.isArray(pr?.value) ? pr!.value : [];
  const { data: sentRows } = await admin.from('doc_reminders_sent').select('doc_id,bucket');
  const sent = new Map((sentRows || []).map((r: any) => [r.doc_id, r.bucket]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due: { p: any; d: any; days: number; bucket: number }[] = [];
  for (const p of providers) for (const d of (p.docs || [])) {
    if (!d.expires) continue;
    const days = Math.round((new Date(d.expires + 'T00:00:00').getTime() - today.getTime()) / 86400000);
    const bucket = bucketOf(days);
    if (bucket === null) continue;
    if (sent.get(d.id) === bucket) continue;
    due.push({ p, d, days, bucket });
  }
  const send = (to: string[], subject: string, html: string) => fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key.value}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to, subject, html }) });
  const when = (days: number) => days < 0 ? `expired ${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'expires today' : `expires in ${days} day${days === 1 ? '' : 's'}`;
  const wrap = (body: string) => `<div style="font-family:Georgia,serif;max-width:520px;margin:auto;padding:28px;color:#1a1a1a"><p style="letter-spacing:.2em;font-size:11px;text-transform:uppercase;color:#8a6d2f">Diaspora House</p>${body}</div>`;
  let providerEmails = 0;
  for (const x of due) {
    if (!real(x.p.email)) continue;
    const r = await send([x.p.email], `Please update your ${x.d.type} with Diaspora House`, wrap(`<p style="font-size:15px;line-height:1.55">Hello ${esc(x.p.contact || x.p.name)},</p><p style="font-size:15px;line-height:1.55">Your ${esc(x.d.type)} on file for ${esc(x.p.name)} ${when(x.days)} (${esc(x.d.expires)}). Please send the renewed document to the House team so you stay eligible for member requests.</p>`));
    if (r.ok) providerEmails++;
  }
  let digest = false;
  if (due.length) {
    const { data: staff } = await admin.from('staff_profiles').select('email').eq('role', 'ceo').eq('active', true);
    const to = (staff || []).map((s: any) => s.email).filter(real);
    if (to.length) {
      const rows = due.sort((a, b) => a.days - b.days).map((x) => `<li style="margin:6px 0">${esc(x.p.name)}: ${esc(x.d.type)} ${when(x.days)}${real(x.p.email) ? '' : ' <i>(no email on file to notify them)</i>'}</li>`).join('');
      const r = await send(to, `${due.length} provider document${due.length === 1 ? '' : 's'} need attention`, wrap(`<p style="font-size:15px">These provider documents are expiring or expired:</p><ul style="font-size:14px;line-height:1.5;padding-left:18px">${rows}</ul>`));
      digest = r.ok;
    }
    await admin.from('doc_reminders_sent').upsert(due.map((x) => ({ doc_id: x.d.id, bucket: x.bucket, at: new Date().toISOString() })), { onConflict: 'doc_id' });
  }
  return new Response(JSON.stringify({ checked: providers.length, reminders: due.length, providerEmails, digest }), { headers: { 'Content-Type': 'application/json' } });
});
