-- Arc90 premium entitlements — written by Stripe webhook on subscription events.
-- Run this in the Supabase SQL editor (or via supabase db push).

create table if not exists public.entitlements (
  id                    uuid primary key default gen_random_uuid(),
  stripe_customer_id    text not null unique,
  stripe_subscription_id text,
  email                 text,
  status                text not null default 'inactive'
                          check (status in ('active', 'inactive', 'cancelled', 'trialing', 'payment_failed')),
  plan                  text not null default 'premium',
  current_period_end    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Auto-update updated_at on every write
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists entitlements_updated_at on public.entitlements;
create trigger entitlements_updated_at
  before update on public.entitlements
  for each row execute function public.touch_updated_at();

-- Index for fast email lookup (verify-premium endpoint)
create index if not exists entitlements_email_idx on public.entitlements (email);

-- Row Level Security: service role bypasses; anon cannot read
alter table public.entitlements enable row level security;

-- Only the service role (webhook + verify endpoint) can touch this table
create policy "service role full access"
  on public.entitlements
  for all
  to service_role
  using (true)
  with check (true);
