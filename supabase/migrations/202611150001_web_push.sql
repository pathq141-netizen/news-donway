-- Web Push subscriptions and idempotency ledger.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_updated_idx on public.push_subscriptions(updated_at);
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
-- No client policies: only Edge Functions using the service-role key can access this table.

create table if not exists public.push_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  article_id uuid references public.articles(id) on delete set null,
  event_type text not null check (event_type in ('article_published','breaking_news')),
  created_at timestamptz not null default now()
);
alter table public.push_notification_events enable row level security;
revoke all on table public.push_notification_events from anon, authenticated;
