create table if not exists public.gemini_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key_label text not null,
  key_hash text not null,
  model text not null,
  daily_request_limit integer not null default 50 check (daily_request_limit >= 0),
  minute_request_limit integer not null default 10 check (minute_request_limit >= 0),
  daily_token_limit integer not null default 0 check (daily_token_limit >= 0),
  token_minute_limit integer not null default 0 check (token_minute_limit >= 0),
  priority integer not null default 0,
  is_active boolean not null default true,
  last_status text not null default 'ready' check (last_status in ('ready', 'success', 'rate_limited', 'error', 'disabled')),
  last_status_code integer,
  last_error text,
  exhausted_until timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, key_label)
);

create index if not exists gemini_api_keys_user_priority_idx
  on public.gemini_api_keys (user_id, is_active, priority, key_label);

create table if not exists public.gemini_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key_label text not null,
  key_hash text not null,
  model text not null,
  request_kind text not null default 'research_filter',
  symbol text,
  timeframe text,
  signal_id uuid references public.signals (id) on delete set null,
  status text not null check (status in ('success', 'rate_limited', 'error', 'skipped')),
  status_code integer,
  request_count integer not null default 1 check (request_count >= 0),
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  candidates_tokens integer not null default 0 check (candidates_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  quota_day date not null default ((timezone('America/Los_Angeles', now()))::date),
  error_type text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists gemini_usage_events_user_day_key_idx
  on public.gemini_usage_events (user_id, quota_day, key_label, created_at desc);

create index if not exists gemini_usage_events_user_created_idx
  on public.gemini_usage_events (user_id, created_at desc);

drop trigger if exists set_gemini_api_keys_updated_at on public.gemini_api_keys;
create trigger set_gemini_api_keys_updated_at
before update on public.gemini_api_keys
for each row
execute function public.set_updated_at();

alter table public.gemini_api_keys enable row level security;
alter table public.gemini_usage_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gemini_api_keys'
      and policyname = 'gemini_api_keys_select_own'
  ) then
    create policy "gemini_api_keys_select_own"
    on public.gemini_api_keys
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gemini_usage_events'
      and policyname = 'gemini_usage_events_select_own'
  ) then
    create policy "gemini_usage_events_select_own"
    on public.gemini_usage_events
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'gemini_api_keys',
    'gemini_usage_events'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
