// Deployed to Supabase as `stripe-webhook` (verify_jwt = false; every request is checked against Stripe's signature).
// Records a paid ticket order under kv key `ops:ticket_orders` and emails the buyer their confirmation.
import { createClient } from 'npm:@supabase/supabase-js@2';
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const FROM = 'Diaspora House <tickets@diasporafamilyoffice.com>';
async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))).map((b) => b.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async (req) => {
  const raw = await req.text();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: ws } = await admin.from('app_secrets').select('value').eq('name', 'stripe_webhook_secret').maybeSingle();
  const header = req.headers.get('stripe-signature') || '';
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  if (!ws?.value || !parts.t || !parts.v1) return new Response('bad signature', { status: 400 });
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return new Response('stale', { status: 400 });
  const expect = await hmac(ws.value, `${parts.t}.${raw}`);
  if (expect.length !== parts.v1.length || !expect.split('').every((c, i) => c === parts.v1[i])) return new Response('bad signature', { status: 400 });
  const evt = JSON.parse(raw);
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(evt.type)) return new Response('ignored');
  const s = evt.data.object;
  if (s.payment_status !== 'paid' || !s.metadata?.event_id) return new Response('ignored');
  const get = async (k: string) => { const { data } = await admin.from('kv').select('value').eq('key', k).maybeSingle(); return Array.isArray(data?.value) ? data.value : []; };
  const [events, rsvps, orders] = await Promise.all([get('ops:events'), get('ops:rsvps'), get('ops:ticket_orders')]);
  const ev = events.find((e: any) => e.id === s.metadata.event_id);
  const qty = Math.max(1, Math.floor(Number(s.metadata.qty) || 1));
  let status = 'paid';
  if (ev) {
    const rsvpSeats = rsvps.filter((r: any) => r.eventId === ev.id && r.status === 'going').reduce((t: number, r: any) => t + 1 + (r.guests || 0), 0);
    const sold = orders.filter((o: any) => o.eventId === ev.id && (o.status === 'paid' || o.status === 'review')).reduce((t: number, o: any) => t + (Number(o.qty) || 0), 0);
    if (qty > (Number(ev.capacity) || 0) - (Number(ev.held) || 0) - rsvpSeats - sold) status = 'review';
  }
  const now = new Date().toISOString();
  const order = { id: s.id, eventId: s.metadata.event_id, qty, amount: (s.amount_total || 0) / 100, name: s.metadata.buyer_name || s.customer_details?.name || '', email: s.customer_details?.email || s.customer_email || '', code: String(s.id).slice(-8).toUpperCase(), status, checkedIn: 0, source: 'online', createdAt: now, updatedAt: now };
  const { data: added } = await admin.rpc('kv_append', { p_key: 'ops:ticket_orders', p_item: order });
  if (!added) return new Response('duplicate'); // Stripe retried an order we already have
  const { data: key } = await admin.from('app_secrets').select('value').eq('name', 'resend_api_key').maybeSingle();
  if (!key?.value) return new Response('recorded');
  const send = (to: string[], subject: string, html: string) => fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key.value}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to, subject, html }) });
  const wrap = (b: string) => `<div style="font-family:Georgia,serif;max-width:480px;margin:auto;padding:28px;color:#1a1a1a"><p style="letter-spacing:.2em;font-size:11px;text-transform:uppercase;color:#8a6d2f">Diaspora House</p>${b}</div>`;
  if (order.email && status === 'paid') {
    await send([order.email], `Your tickets: ${ev?.name || 'Diaspora House event'}`, wrap(`<p style="font-size:15px;line-height:1.55">Thank you${order.name ? ', ' + esc(order.name) : ''}. Your ${qty} ticket${qty === 1 ? '' : 's'} for <b>${esc(ev?.name || 'the event')}</b> ${qty === 1 ? 'is' : 'are'} confirmed.</p><p style="font-size:14px;line-height:1.6">${ev?.date ? esc(ev.date) : ''}${ev?.time ? ' · ' + esc(ev.time) : ''}${ev?.room ? '<br>' + esc(ev.room) : ''}${ev?.dress ? '<br>Dress: ' + esc(ev.dress) : ''}</p><p style="font-size:13px;color:#666;margin:18px 0 4px">Show this code at the door</p><p style="font-size:30px;letter-spacing:.3em;font-weight:bold;margin:0">${order.code}</p><p style="font-size:12.5px;color:#777;margin-top:18px">${qty} guest${qty === 1 ? '' : 's'} admitted on this code. Paid $${order.amount.toFixed(2)}.</p>`));
  } else if (status === 'review') {
    const { data: staff } = await admin.from('staff_profiles').select('email').eq('role', 'ceo').eq('active', true);
    const to = (staff || []).map((x: any) => x.email).filter(Boolean);
    if (to.length) await send(to, 'Ticket order needs review: event may be oversold', wrap(`<p style="font-size:15px;line-height:1.55">${esc(order.name)} (${esc(order.email)}) paid $${order.amount.toFixed(2)} for ${qty} ticket${qty === 1 ? '' : 's'} to <b>${esc(ev?.name || '')}</b>, but there were not enough seats left. No confirmation was sent. Either make room or refund the order in Stripe, then update the order in the Ops Console.</p>`));
  }
  return new Response('recorded');
});
