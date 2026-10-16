-- Diaspora House database (Supabase project eptsqnvenmllmzshigoi). Schema, role access and policies. No passwords.
-- Diaspora House: roles, staff profiles, shared data store with row-level security
create table public.roles (
  role text primary key,
  label text not null,
  blurb text not null default ''
);
create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  title text not null default '',
  role text not null references public.roles(role),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.role_access (
  role text not null references public.roles(role) on delete cascade,
  key text not null,
  can_write boolean not null default false,
  primary key (role, key)
);
create table public.kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index staff_profiles_role_idx on public.staff_profiles(role);

create function public.current_staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.staff_profiles where user_id = auth.uid() and active
$$;
revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated;

create function public.kv_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger kv_touch_trg before insert or update on public.kv for each row execute function public.kv_touch();

alter table public.roles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.role_access enable row level security;
alter table public.kv enable row level security;

create policy roles_read on public.roles for select to authenticated using (true);
create policy roles_ceo_write on public.roles for all to authenticated
  using ((select public.current_staff_role()) = 'ceo') with check ((select public.current_staff_role()) = 'ceo');

create policy staff_read_self_or_ceo on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_staff_role()) = 'ceo');
create policy staff_ceo_write on public.staff_profiles for all to authenticated
  using ((select public.current_staff_role()) = 'ceo') with check ((select public.current_staff_role()) = 'ceo');

create policy access_read on public.role_access for select to authenticated using ((select public.current_staff_role()) is not null);
create policy access_ceo_write on public.role_access for all to authenticated
  using ((select public.current_staff_role()) = 'ceo') with check ((select public.current_staff_role()) = 'ceo');

create policy kv_read on public.kv for select to authenticated using (
  (select public.current_staff_role()) = 'ceo'
  or exists (select 1 from public.role_access ra where ra.role = (select public.current_staff_role()) and ra.key = kv.key));
create policy kv_insert on public.kv for insert to authenticated with check (
  (select public.current_staff_role()) = 'ceo'
  or exists (select 1 from public.role_access ra where ra.role = (select public.current_staff_role()) and ra.key = kv.key and ra.can_write));
create policy kv_update on public.kv for update to authenticated using (
  (select public.current_staff_role()) = 'ceo'
  or exists (select 1 from public.role_access ra where ra.role = (select public.current_staff_role()) and ra.key = kv.key and ra.can_write))
  with check (
  (select public.current_staff_role()) = 'ceo'
  or exists (select 1 from public.role_access ra where ra.role = (select public.current_staff_role()) and ra.key = kv.key and ra.can_write));
create policy kv_delete on public.kv for delete to authenticated using ((select public.current_staff_role()) = 'ceo');

-- anon (not signed in) gets nothing
revoke all on public.roles, public.staff_profiles, public.role_access, public.kv from anon;

insert into public.roles(role,label,blurb) values
('ceo','CEO','Sees and edits everything. Can view the app as any role.'),
('concierge','Concierge','Answers member requests, runs room bookings and event check-in.'),
('membership','Membership Lead','Runs admissions, member records and Capital Circles.'),
('programming','Programming','Events, rooms, circles, language tables and talent.'),
('commerce','Souk & Academy','Vendors, stock, reservations, classes and rosters.'),
('housekeeping','Housekeeping','Sees which rooms are booked and when, to prepare and reset them. Cannot see members or requests.'),
('frontdesk','Front Desk','Greets guests and checks people in to events.'),
('auditor','Read-only auditor','Can look at every screen. Cannot change anything.');
insert into public.role_access(role,key,can_write) values
('concierge','ops:activity_log',true),
('concierge','ops:bookings',true),
('concierge','ops:events',false),
('concierge','ops:locations',false),
('concierge','ops:members',false),
('concierge','ops:requests',true),
('concierge','ops:rsvps',true),
('concierge','ops:spaces',false),
('concierge','ops:talent_directory',false),
('membership','ops:activity_log',true),
('membership','ops:applications',true),
('membership','ops:circles',true),
('membership','ops:events',false),
('membership','ops:members',true),
('membership','ops:requests',false),
('programming','ops:activity_log',true),
('programming','ops:bookings',true),
('programming','ops:circles',true),
('programming','ops:events',true),
('programming','ops:language_tables',true),
('programming','ops:locations',true),
('programming','ops:members',false),
('programming','ops:rsvps',true),
('programming','ops:spaces',true),
('programming','ops:talent_directory',true),
('commerce','ops:academy_classes',true),
('commerce','ops:activity_log',true),
('commerce','ops:enrollments',true),
('commerce','ops:souk_reservations',true),
('commerce','ops:souk_vendors',true),
('housekeeping','ops:bookings',false),
('housekeeping','ops:events',false),
('housekeeping','ops:locations',false),
('housekeeping','ops:spaces',false),
('frontdesk','ops:activity_log',true),
('frontdesk','ops:bookings',false),
('frontdesk','ops:events',false),
('frontdesk','ops:members',false),
('frontdesk','ops:rsvps',true),
('frontdesk','ops:spaces',false),
('auditor','ops:academy_classes',false),
('auditor','ops:activity_log',false),
('auditor','ops:applications',false),
('auditor','ops:bookings',false),
('auditor','ops:circles',false),
('auditor','ops:enrollments',false),
('auditor','ops:events',false),
('auditor','ops:language_tables',false),
('auditor','ops:locations',false),
('auditor','ops:members',false),
('auditor','ops:requests',false),
('auditor','ops:rsvps',false),
('auditor','ops:souk_reservations',false),
('auditor','ops:souk_vendors',false),
('auditor','ops:spaces',false),
('auditor','ops:talent_directory',false);

-- Mock team (auth users are created separately; see users.sql)

-- Sign-in email via Resend (edge function `send-code`): private tables, service role only
create table if not exists public.app_secrets (name text primary key, value text not null, updated_at timestamptz not null default now());
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
create table if not exists public.signin_attempts (id bigserial primary key, email text not null, at timestamptz not null default now());
alter table public.signin_attempts enable row level security;
revoke all on public.signin_attempts from anon, authenticated;
create index if not exists signin_attempts_email_at on public.signin_attempts(email, at desc);

-- Providers (build #3): reminder log, private document bucket (CEO only), daily reminder job
create table if not exists public.doc_reminders_sent (doc_id text primary key, bucket int not null, at timestamptz not null default now());
alter table public.doc_reminders_sent enable row level security;
revoke all on public.doc_reminders_sent from anon, authenticated;
insert into storage.buckets (id, name, public, file_size_limit) values ('provider-docs','provider-docs', false, 15728640) on conflict (id) do nothing;
create policy "provider_docs_ceo_select" on storage.objects for select to authenticated using (bucket_id='provider-docs' and (select private.current_staff_role())='ceo');
create policy "provider_docs_ceo_insert" on storage.objects for insert to authenticated with check (bucket_id='provider-docs' and (select private.current_staff_role())='ceo');
create policy "provider_docs_ceo_update" on storage.objects for update to authenticated using (bucket_id='provider-docs' and (select private.current_staff_role())='ceo');
create policy "provider_docs_ceo_delete" on storage.objects for delete to authenticated using (bucket_id='provider-docs' and (select private.current_staff_role())='ceo');
-- app_secrets rows 'resend_api_key' and 'cron_key' are set directly in the database, never committed.
-- select cron.schedule('provider-doc-expiry-daily','0 14 * * *', $$select net.http_post(url:='https://eptsqnvenmllmzshigoi.supabase.co/functions/v1/expiry-reminders', headers:=jsonb_build_object('Content-Type','application/json','x-cron-key',(select value from public.app_secrets where name='cron_key')), body:='{}'::jsonb)$$);
