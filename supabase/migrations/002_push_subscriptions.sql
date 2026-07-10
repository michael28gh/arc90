-- Push subscriptions for background reminders (Web Push).
-- Stores ONLY the push endpoint + reminder preferences — never habit logs,
-- journal entries, or any personal content. Run in the Supabase SQL editor.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id text unique not null,
  subscription jsonb not null,
  mode text not null default 'daily' check (mode in ('daily', '4h', '2h')),
  remind_time text not null default '08:00',
  tz_offset_min integer not null default 0,  -- minutes east of UTC (e.g. -420 for PDT)
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- Service-role only: the app talks to this via Vercel functions, never directly.
drop policy if exists "service role only" on push_subscriptions;
create policy "service role only" on push_subscriptions
  for all to service_role using (true) with check (true);
