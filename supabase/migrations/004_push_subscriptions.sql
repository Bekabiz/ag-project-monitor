-- Push notification subscriptions for Web Push API
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  endpoint text not null,
  subscription text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);
create unique index if not exists idx_push_subscriptions_endpoint on push_subscriptions(user_id, endpoint);

alter table push_subscriptions enable row level security;

create policy "Users can manage their own subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role full access"
  on push_subscriptions for all
  using (auth.role() = 'service_role');
