-- Supabase main branch schema snapshot (public/auth/storage)
-- Generated via MCP inspection to bootstrap migration management

-- Ensure required extensions exist
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "pg_graphql";
create extension if not exists "pg_stat_statements";
create extension if not exists "supabase_vault";

-- Utility functions
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Core tables
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  stripe_customer_id text unique,
  subscription_status text default 'free',
  subscription_tier text default 'basic',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.user_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  language text default 'ja',
  timezone text default 'Asia/Tokyo',
  notifications_enabled boolean default true,
  sdk_auto_execute boolean default false,
  max_monthly_sdk_tasks integer default 100,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.connections (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  service text not null,
  encrypted_tokens jsonb not null,
  session_id text unique,
  metadata jsonb,
  is_active boolean default true,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create unique index if not exists connections_user_id_service_key on public.connections(user_id, service);
create index if not exists idx_connections_user_id on public.connections(user_id);
create index if not exists idx_connections_session_id on public.connections(session_id);

create table if not exists public.sdk_tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_type text not null,
  status text default 'pending',
  title text not null,
  description text,
  input_data jsonb,
  output_data jsonb,
  error_message text,
  execution_time_ms integer,
  created_at timestamptz default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_sdk_tasks_user_id on public.sdk_tasks(user_id);
create index if not exists idx_sdk_tasks_status on public.sdk_tasks(status);
create index if not exists idx_sdk_tasks_created_at on public.sdk_tasks(created_at desc);

create table if not exists public.task_results (
  id uuid default uuid_generate_v4() primary key,
  task_id uuid not null references public.sdk_tasks(id) on delete cascade,
  result_type text not null,
  title text not null,
  description text,
  url text,
  metadata jsonb,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists idx_task_results_task_id on public.task_results(task_id);

create table if not exists public.usage_tracking (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_type text not null,
  quantity integer default 1,
  metadata jsonb,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists idx_usage_tracking_user_id_created_at on public.usage_tracking(user_id, created_at desc);

create table if not exists public.tokens (
  id text primary key,
  session_id text not null,
  bot_token text,
  user_token text,
  created_at timestamp without time zone default current_timestamp,
  updated_at timestamp without time zone default current_timestamp,
  slack_user_id text
);

create table if not exists public.browser_contexts (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  site text not null,
  context_id text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp without time zone default current_timestamp,
  updated_at timestamp without time zone default current_timestamp
);

create unique index if not exists browser_contexts_user_id_site_key on public.browser_contexts(user_id, site);
create index if not exists idx_browser_contexts_user_id on public.browser_contexts(user_id);

create table if not exists public.user_preferences (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  key text not null,
  value jsonb not null,
  created_at timestamp without time zone default current_timestamp,
  updated_at timestamp without time zone default current_timestamp
);

create unique index if not exists user_preferences_user_id_key_key on public.user_preferences(user_id, key);
create index if not exists idx_user_preferences_user_id on public.user_preferences(user_id);

create table if not exists public.scheduled_tasks (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  instruction text not null,
  frequency text not null,
  time text,
  day_of_week text,
  interval_hours numeric,
  task_type text not null,
  config jsonb default '{}'::jsonb,
  next_run timestamptz not null,
  last_run timestamptz,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  assigned_to text,
  timezone text default 'UTC'
);

create index if not exists idx_scheduled_tasks_next_run on public.scheduled_tasks(next_run, status);
create index if not exists idx_scheduled_tasks_user_id on public.scheduled_tasks(user_id);

create table if not exists public.task_execution_logs (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.scheduled_tasks(id) on delete cascade,
  user_id text not null,
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text not null,
  result jsonb,
  error text,
  created_at timestamptz default now()
);

create index if not exists idx_task_execution_logs_task_id on public.task_execution_logs(task_id);
create index if not exists idx_task_execution_logs_user_id on public.task_execution_logs(user_id);

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text default 'free',
  status text default 'inactive',
  current_period_end timestamptz,
  trial_end timestamptz,
  metadata jsonb default '{}'::jsonb,
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.subscription_events (
  event_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz default timezone('utc', now())
);

create table if not exists public.realtime_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (timezone('utc', now()))::date,
  count integer default 0,
  updated_at timestamptz default timezone('utc', now()),
  primary key (user_id, usage_date)
);

-- Triggers
drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at_connections on public.connections;
create trigger set_updated_at_connections
  before update on public.connections
  for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at_user_settings on public.user_settings;
create trigger set_updated_at_user_settings
  before update on public.user_settings
  for each row execute function public.handle_updated_at();

drop trigger if exists update_scheduled_tasks_updated_at on public.scheduled_tasks;
create trigger update_scheduled_tasks_updated_at
  before update on public.scheduled_tasks
  for each row execute function public.update_updated_at_column();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row level security (match existing policies)
alter table public.profiles enable row level security;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

alter table public.user_settings enable row level security;
drop policy if exists "Users can view own settings" on public.user_settings;
create policy "Users can view own settings" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings" on public.user_settings
  for all using (auth.uid() = user_id);

alter table public.connections enable row level security;
drop policy if exists "Users can view own connections" on public.connections;
create policy "Users can view own connections" on public.connections
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own connections" on public.connections;
create policy "Users can insert own connections" on public.connections
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own connections" on public.connections;
create policy "Users can update own connections" on public.connections
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own connections" on public.connections;
create policy "Users can delete own connections" on public.connections
  for delete using (auth.uid() = user_id);

alter table public.sdk_tasks enable row level security;
drop policy if exists "Users can view own tasks" on public.sdk_tasks;
create policy "Users can view own tasks" on public.sdk_tasks
  for select using (auth.uid() = user_id);

drop policy if exists "Users can create own tasks" on public.sdk_tasks;
create policy "Users can create own tasks" on public.sdk_tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own tasks" on public.sdk_tasks;
create policy "Users can update own tasks" on public.sdk_tasks
  for update using (auth.uid() = user_id);

alter table public.task_results enable row level security;
drop policy if exists "Users can view own task results" on public.task_results;
create policy "Users can view own task results" on public.task_results
  for select using (
    exists (
      select 1 from public.sdk_tasks
      where sdk_tasks.id = task_results.task_id
        and sdk_tasks.user_id = auth.uid()
    )
  );

alter table public.task_execution_logs enable row level security;
drop policy if exists "Users can view own execution logs" on public.task_execution_logs;
create policy "Users can view own execution logs" on public.task_execution_logs
  for select using (user_id = auth.uid()::text);

drop policy if exists "Users can insert own execution logs" on public.task_execution_logs;
create policy "Users can insert own execution logs" on public.task_execution_logs
  for insert with check (user_id = auth.uid()::text);

alter table public.scheduled_tasks enable row level security;
drop policy if exists "Users can view own scheduled tasks" on public.scheduled_tasks;
create policy "Users can view own scheduled tasks" on public.scheduled_tasks
  for select using (user_id = auth.uid()::text);

drop policy if exists "Users can insert own scheduled tasks" on public.scheduled_tasks;
create policy "Users can insert own scheduled tasks" on public.scheduled_tasks
  for insert with check (user_id = auth.uid()::text);

drop policy if exists "Users can update own scheduled tasks" on public.scheduled_tasks;
create policy "Users can update own scheduled tasks" on public.scheduled_tasks
  for update using (user_id = auth.uid()::text);

drop policy if exists "Users can delete own scheduled tasks" on public.scheduled_tasks;
create policy "Users can delete own scheduled tasks" on public.scheduled_tasks
  for delete using (user_id = auth.uid()::text);

alter table public.user_subscriptions enable row level security;
drop policy if exists "users can view own subscription" on public.user_subscriptions;
create policy "users can view own subscription" on public.user_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "user_subscriptions_select_self" on public.user_subscriptions;
create policy "user_subscriptions_select_self" on public.user_subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "service role manages subscriptions" on public.user_subscriptions;
create policy "service role manages subscriptions" on public.user_subscriptions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "user_subscriptions_sr_write" on public.user_subscriptions;
create policy "user_subscriptions_sr_write" on public.user_subscriptions
  to service_role using (true) with check (true);

alter table public.subscription_events enable row level security;
drop policy if exists "subscription_events_sr_only" on public.subscription_events;
create policy "subscription_events_sr_only" on public.subscription_events
  to service_role using (true) with check (true);

drop policy if exists "service role manages subscription events" on public.subscription_events;
create policy "service role manages subscription events" on public.subscription_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

alter table public.realtime_usage_daily enable row level security;
drop policy if exists "users can view own daily usage" on public.realtime_usage_daily;
create policy "users can view own daily usage" on public.realtime_usage_daily
  for select using (auth.uid() = user_id);

drop policy if exists "realtime_usage_daily_select_self" on public.realtime_usage_daily;
create policy "realtime_usage_daily_select_self" on public.realtime_usage_daily
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "service role updates daily usage" on public.realtime_usage_daily;
create policy "service role updates daily usage" on public.realtime_usage_daily
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "realtime_usage_daily_sr_write" on public.realtime_usage_daily;
create policy "realtime_usage_daily_sr_write" on public.realtime_usage_daily
  to service_role using (true) with check (true);

alter table public.usage_tracking enable row level security;
drop policy if exists "Users can view own usage" on public.usage_tracking;
create policy "Users can view own usage" on public.usage_tracking
  for select using (auth.uid() = user_id);

alter table public.browser_contexts enable row level security;
alter table public.user_preferences enable row level security;
alter table public.tokens enable row level security;

drop policy if exists "Users can view own browser contexts" on public.browser_contexts;
create policy "Users can view own browser contexts" on public.browser_contexts
  for select using (user_id = auth.uid()::text);

drop policy if exists "Users can manage own browser contexts" on public.browser_contexts;
create policy "Users can manage own browser contexts" on public.browser_contexts
  for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

alter table public.user_preferences enable row level security;
drop policy if exists "Users can view own preferences" on public.user_preferences;
create policy "Users can view own preferences" on public.user_preferences
  for select using (user_id = auth.uid()::text);

drop policy if exists "Users can manage own preferences" on public.user_preferences;
create policy "Users can manage own preferences" on public.user_preferences
  for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

alter table public.tokens enable row level security;
drop policy if exists "Service role manages tokens" on public.tokens;
create policy "Service role manages tokens" on public.tokens
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
