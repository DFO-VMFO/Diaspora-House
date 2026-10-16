// Deployed to Supabase as `create-checkout` (verify_jwt = false). Public: starts a Stripe Checkout for tickets. Needs STRIPE_SECRET_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
async function loadEvent(admin: any, id: string) {
  const get = async (k: string) => { const { data } = await admin.from('kv').select('value').eq('key', k).maybeSingle(); return Array.isArray(data?.value) ? data.value : []; };
  const [events, rsvps, orders] = await Promise.all([get('ops:events'), get('ops:rsvps'), get('ops:ticket_orders')]);
  const ev = events.find((e: any) => e.id === id);
  if (!ev) return null;
  const rsvpSeats = rsvps.filter((r: any) => r.eventId === id && r.status === 'going').reduce((t: number, r: any) => t + 1 + (r.guests || 0), 0);
  const sold = orders.filter((o: any) => o.eventId === id && (o.status === 'paid' || o.status === 'review')).reduce((t: number, o: any) => t + (Number(o.qty) || 0), 0);
  return { ev, remaining: Math.max(0, (Number(ev.capacity) || 0) - (Number(ev.held) || 0) - rsvpSeats - sold) };
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let b: any; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const id = String(b.e || ''), qty = Math.floor(Number(b.qty)), name = String(b.name || '').trim().slice(0, 120), email = String(b.email || '').trim().toLowerCase().slice(0, 200), back = String(b.returnTo || '');
  if (!/^[\w-]{1,40}$/.test(id) || !(qty >= 1 && qty <= 10) || !name || !/^\S+@\S+\.\S+$/.test(email) || !/^https:\/\/[^\s?#]+$/.test(back)) return json({ error: 'Please check your details.' }, 400);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const r = await loadEvent(admin, id);
  if (!r || !r.ev.onSale || r.ev.status === 'cancelled') return json({ error: 'Tickets are not on sale for this event.' }, 404);
  if (r.remaining < qty) return json({ error: r.remaining ? `Only ${r.remaining} seat${r.remaining === 1 ? '' : 's'} left.` : 'Sold out.' }, 409);
  const price = Math.round((Number(r.ev.ticketPrice) || 0) * 100);
  if (price < 50) return json({ error: 'Tickets are not on sale for this event.' }, 404);
  const { data: sec } = await admin.from('app_secrets').select('value').eq('name', 'stripe_secret_key').maybeSingle();
  const key = Deno.env.get('STRIPE_SECRET_KEY') || sec?.value || '';
  if (!key) return json({ error: 'Online ticketing is not switched on yet. Please contact the House.' }, 503);
  const f = new URLSearchParams();
  f.set('mode', 'payment'); f.set('customer_email', email);
  f.set('line_items[0][quantity]', String(qty));
  f.set('line_items[0][price_data][currency]', 'usd');
  f.set('line_items[0][price_data][unit_amount]', String(price));
  f.set('line_items[0][price_data][product_data][name]', `${r.ev.name} · ticket`);
  if (r.ev.date) f.set('line_items[0][price_data][product_data][description]', `${r.ev.date}${r.ev.time ? ' · ' + r.ev.time : ''}${r.ev.room ? ' · ' + r.ev.room : ''}`.slice(0, 300));
  f.set('success_url', `${back}?e=${id}&paid=1`); f.set('cancel_url', `${back}?e=${id}`);
  f.set('metadata[event_id]', id); f.set('metadata[qty]', String(qty)); f.set('metadata[buyer_name]', name);
  const s = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f });
  const j = await s.json();
  if (!s.ok || !j.url) return json({ error: 'Could not start checkout. Please try again.' }, 502);
  return json({ url: j.url });
});
