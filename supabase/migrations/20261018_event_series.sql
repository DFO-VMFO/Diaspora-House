-- Programming Series (recurring events): who may read and write ops:event_series.
-- Safe to run more than once. The CEO already has full access through the kv policies;
-- this only matters for the other staff roles.
insert into public.role_access(role,key,can_write) values
('programming','ops:event_series',true),
('concierge','ops:event_series',false),
('membership','ops:event_series',false),
('auditor','ops:event_series',false)
on conflict (role,key) do nothing;
