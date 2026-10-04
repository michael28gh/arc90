-- Review and apply before deploying server-only email capture.
-- Removing browser grants also blocks legacy public INSERT policies.
begin;

create table if not exists public.subscribers (
  email text primary key,
  consent boolean not null default false,
  consent_at timestamptz,
  source text not null default 'app',
  created_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;
revoke all on table public.subscribers from anon, authenticated;
grant select, insert, update, delete on table public.subscribers to service_role;

commit;
