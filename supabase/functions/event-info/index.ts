// Deployed to Supabase as `event-info` (verify_jwt = false). Public: what the ticket page shows for one event, and how many seats are left.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
export async function loadEvent(admin: any, id: string) {
  const get = async (k: string) => { const { data } = await admin.from('kv').select('value').eq('key', k).maybeSingle(); return Array.isArray(data?.value) ? data.value : []; };
  const [events, rsvps, orders] = await Promise.all([get('ops:events'), get('ops:rsvps'), get('ops:ticket_orders')]);
  const ev = events.find((e: any) => e.id === id);
  if (!ev) return null;
  const rsvpSeats = rsvps.filter((r: any) => r.eventId === id && r.status === 'going').reduce((t: number, r: any) => t + 1 + (r.guests || 0), 0);
  const sold = orders.filter((o: any) => o.eventId === id && (o.status === 'paid' || o.status === 'review')).reduce((t: number, o: any) => t + (Number(o.qty) || 0), 0);
  const remaining = Math.max(0, (Number(ev.capacity) || 0) - (Number(ev.held) || 0) - rsvpSeats - sold);
  return { ev, remaining };
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const id = new URL(req.url).searchParams.get('e') || '';
  if (!/^[\w-]{1,40}$/.test(id)) return json({ state: 'unknown' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const r = await loadEvent(admin, id);
  if (!r || !r.ev.onSale || r.ev.status === 'cancelled') return json({ state: 'unknown' });
  const { ev, remaining } = r;
  const price = Number(ev.ticketPrice) || 0;
  if (!price) return json({ state: 'unknown' });
  const past = ev.date && String(ev.date) < new Date().toISOString().slice(0, 10);
  const { data: sec } = await admin.from('app_secrets').select('value').eq('name', 'stripe_secret_key').maybeSingle();
  const key = Deno.env.get('STRIPE_SECRET_KEY') || sec?.value || '';
  return json({ state: past ? 'closed' : remaining <= 0 ? 'soldout' : 'open', event: { name: ev.name, date: ev.date, time: ev.time, room: ev.room, category: ev.category, desc: ev.desc, dress: ev.dress, curator: ev.curator }, price, remaining, maxPerOrder: Math.min(10, remaining), test: key.startsWith('sk_test_'), ready: !!key });
});
