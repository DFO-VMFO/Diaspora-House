// Deployed to Supabase as `job-response` (verify_jwt = false). Public: a provider opens their private link and accepts or declines.
// It never edits jobs directly; it records the answer under kv key `ops:job_responses`, and the Ops Console applies it.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const short = (n: string) => { const p = String(n || 'A member').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : p[0]; };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let t = '', action = '';
  if (req.method === 'GET') t = new URL(req.url).searchParams.get('t') || '';
  else { try { const b = await req.json(); t = String(b.t || ''); action = String(b.action || ''); } catch { return json({ error: 'bad request' }, 400); } }
  if (!/^[a-z0-9]{6,32}$/i.test(t)) return json({ state: 'unknown' });
  const { data: jr } = await admin.from('kv').select('value').eq('key', 'ops:jobs').maybeSingle();
  const job = (Array.isArray(jr?.value) ? jr!.value : []).find((j: any) => j.token === t);
  if (!job) return json({ state: 'unknown' });
  const { data: rr } = await admin.from('kv').select('value').eq('key', 'ops:job_responses').maybeSingle();
  const resp: Record<string, any> = (rr?.value && typeof rr.value === 'object' && !Array.isArray(rr.value)) ? rr.value : {};
  const prev = resp[t];
  const answered = prev && (!job.offeredAt || String(prev.at) > String(job.offeredAt));
  const overdue = job.responseDueAt && new Date(job.responseDueAt).getTime() < Date.now();
  const view = { summary: job.summary, neededBy: job.neededBy, location: job.location, member: short(job.member), pay: job.cost, provider: job.providerName, details: job.details || '' };
  if (answered) return json({ state: prev.action === 'accept' ? 'accepted' : 'declined', job: view });
  if (job.status !== 'offered' || overdue) return json({ state: 'closed', job: { summary: job.summary } });
  if (req.method === 'GET') return json({ state: 'open', job: view });
  if (action !== 'accept' && action !== 'decline') return json({ error: 'bad action' }, 400);
  resp[t] = { action, at: new Date().toISOString() };
  const { error } = await admin.from('kv').upsert({ key: 'ops:job_responses', value: resp }, { onConflict: 'key' });
  if (error) return json({ error: 'could not save' }, 500);
  return json({ state: action === 'accept' ? 'accepted' : 'declined', job: view });
});
