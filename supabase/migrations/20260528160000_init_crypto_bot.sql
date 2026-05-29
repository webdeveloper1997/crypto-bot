create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, 'operator'), '@', 1)
    )
  )
  on conflict (id) do nothing;

  insert into public.bot_settings (user_id, display_name)
  values (new.id, 'Primary Bot')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'operator',
  timezone text not null default 'UTC',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bot_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null default 'Primary Bot',
  desired_mode text not null default 'paper' check (desired_mode in ('paper', 'testnet', 'live')),
  actual_mode text not null default 'paper' check (actual_mode in ('paper', 'testnet', 'live')),
  is_running boolean not null default false,
  symbols text[] not null default array['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  timeframe text not null default '1m',
  decision_interval_minutes integer not null default 5 check (decision_interval_minutes > 0),
  paper_starting_balance numeric(20, 8) not null default 1000,
  live_starting_balance numeric(20, 8) not null default 1000,
  paper_trade_notional numeric(20, 8) not null default 50,
  live_trade_notional numeric(20, 8) not null default 25,
  max_concurrent_positions integer not null default 2 check (max_concurrent_positions > 0),
  max_symbol_allocation_pct numeric(10, 4) not null default 10,
  max_total_exposure_pct numeric(10, 4) not null default 25,
  daily_drawdown_limit_pct numeric(10, 4) not null default 2,
  weekly_drawdown_limit_pct numeric(10, 4) not null default 6,
  strategy_version text not null default 'intraday-rules-ml-v1',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bot_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  command_type text not null check (command_type in ('switch_mode', 'start_bot', 'stop_bot', 'flatten_all', 'reconcile')),
  status text not null default 'pending' check (status in ('pending', 'applied', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  error_message text
);

create index if not exists bot_commands_user_status_requested_idx
  on public.bot_commands (user_id, status, requested_at desc);

create table if not exists public.market_bars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  timeframe text not null,
  opened_at timestamptz not null,
  open numeric(20, 8) not null,
  high numeric(20, 8) not null,
  low numeric(20, 8) not null,
  close numeric(20, 8) not null,
  volume numeric(24, 8) not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, symbol, timeframe, opened_at)
);

create index if not exists market_bars_user_symbol_timeframe_opened_idx
  on public.market_bars (user_id, symbol, timeframe, opened_at desc);

create table if not exists public.llm_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  timeframe text not null,
  provider text not null default 'gemini',
  model text not null default 'gemini-2.5-flash',
  analysis_kind text not null default 'research_filter',
  sentiment text not null default 'neutral' check (sentiment in ('bullish', 'bearish', 'neutral')),
  risk_flag boolean not null default false,
  confidence numeric(10, 4) not null default 0,
  rationale text,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  llm_analysis_id uuid references public.llm_analyses (id) on delete set null,
  symbol text not null,
  timeframe text not null,
  generated_at timestamptz not null default timezone('utc', now()),
  predicted_direction text not null check (predicted_direction in ('buy', 'sell', 'hold')),
  confidence numeric(10, 4) not null default 0,
  expected_move_bps numeric(12, 4) not null default 0,
  score numeric(12, 4) not null default 0,
  regime text,
  rationale text,
  entry_plan jsonb not null default '{}'::jsonb,
  stop_plan jsonb not null default '{}'::jsonb,
  take_profit_plan jsonb not null default '{}'::jsonb,
  strategy_version text not null,
  realized_return_bps numeric(12, 4),
  mae_bps numeric(12, 4),
  mfe_bps numeric(12, 4),
  fee_quote numeric(20, 8),
  slippage_bps numeric(12, 4),
  hit boolean
);

create index if not exists signals_user_generated_idx
  on public.signals (user_id, generated_at desc);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  signal_id uuid references public.signals (id) on delete set null,
  broker_mode text not null check (broker_mode in ('paper', 'testnet', 'live')),
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  order_type text not null default 'market' check (order_type in ('market', 'limit')),
  status text not null default 'submitted' check (status in ('submitted', 'filled', 'cancelled', 'rejected')),
  client_order_id text not null unique,
  exchange_order_id text,
  quantity numeric(24, 8) not null,
  price numeric(20, 8),
  stop_price numeric(20, 8),
  fees_quote numeric(20, 8) not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  placed_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists orders_user_placed_idx
  on public.orders (user_id, placed_at desc);

create table if not exists public.fills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  executed_at timestamptz not null default timezone('utc', now()),
  quantity numeric(24, 8) not null,
  price numeric(20, 8) not null,
  commission_asset text,
  commission_amount numeric(24, 8) not null default 0,
  quote_amount numeric(24, 8) not null default 0,
  exchange_trade_id text
);

create index if not exists fills_user_executed_idx
  on public.fills (user_id, executed_at desc);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  signal_id uuid references public.signals (id) on delete set null,
  symbol text not null,
  mode text not null check (mode in ('paper', 'testnet', 'live')),
  status text not null default 'open' check (status in ('open', 'closed')),
  quantity numeric(24, 8) not null,
  average_entry numeric(20, 8) not null,
  unrealized_pnl numeric(20, 8) not null default 0,
  realized_pnl numeric(20, 8) not null default 0,
  fee_total numeric(20, 8) not null default 0,
  opened_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists positions_one_open_per_symbol_mode
  on public.positions (user_id, symbol, mode)
  where status = 'open';

create table if not exists public.equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('paper', 'testnet', 'live')),
  snapped_at timestamptz not null default timezone('utc', now()),
  cash_balance numeric(20, 8) not null default 0,
  invested_balance numeric(20, 8) not null default 0,
  total_equity numeric(20, 8) not null default 0,
  realized_pnl numeric(20, 8) not null default 0,
  unrealized_pnl numeric(20, 8) not null default 0,
  fee_total numeric(20, 8) not null default 0,
  drawdown_pct numeric(10, 4) not null default 0
);

create index if not exists equity_snapshots_user_snapped_idx
  on public.equity_snapshots (user_id, snapped_at desc);

create table if not exists public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('paper', 'testnet', 'live')),
  trading_day date not null,
  gross_pnl numeric(20, 8) not null default 0,
  net_pnl numeric(20, 8) not null default 0,
  fee_total numeric(20, 8) not null default 0,
  slippage_total numeric(20, 8) not null default 0,
  win_rate numeric(10, 4) not null default 0,
  trades_count integer not null default 0,
  predictions_hit integer not null default 0,
  predictions_total integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, mode, trading_day)
);

create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  mode text not null check (mode in ('paper', 'testnet', 'live')),
  symbol text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  triggered_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz
);

create index if not exists risk_events_user_triggered_idx
  on public.risk_events (user_id, triggered_at desc);

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_bot_settings_updated_at on public.bot_settings;
create trigger set_bot_settings_updated_at
before update on public.bot_settings
for each row
execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

drop trigger if exists set_positions_updated_at on public.positions;
create trigger set_positions_updated_at
before update on public.positions
for each row
execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

alter table public.user_profiles enable row level security;
alter table public.bot_settings enable row level security;
alter table public.bot_commands enable row level security;
alter table public.market_bars enable row level security;
alter table public.llm_analyses enable row level security;
alter table public.signals enable row level security;
alter table public.orders enable row level security;
alter table public.fills enable row level security;
alter table public.positions enable row level security;
alter table public.equity_snapshots enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.risk_events enable row level security;

create policy "user_profiles_select_own"
on public.user_profiles
for select
to authenticated
using (auth.uid() = id);

create policy "user_profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "bot_settings_select_own"
on public.bot_settings
for select
to authenticated
using (auth.uid() = user_id);

create policy "bot_settings_insert_own"
on public.bot_settings
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "bot_settings_update_own"
on public.bot_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "bot_commands_select_own"
on public.bot_commands
for select
to authenticated
using (auth.uid() = user_id);

create policy "bot_commands_insert_own"
on public.bot_commands
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "market_bars_select_own"
on public.market_bars
for select
to authenticated
using (auth.uid() = user_id);

create policy "llm_analyses_select_own"
on public.llm_analyses
for select
to authenticated
using (auth.uid() = user_id);

create policy "signals_select_own"
on public.signals
for select
to authenticated
using (auth.uid() = user_id);

create policy "orders_select_own"
on public.orders
for select
to authenticated
using (auth.uid() = user_id);

create policy "fills_select_own"
on public.fills
for select
to authenticated
using (auth.uid() = user_id);

create policy "positions_select_own"
on public.positions
for select
to authenticated
using (auth.uid() = user_id);

create policy "equity_snapshots_select_own"
on public.equity_snapshots
for select
to authenticated
using (auth.uid() = user_id);

create policy "daily_metrics_select_own"
on public.daily_metrics
for select
to authenticated
using (auth.uid() = user_id);

create policy "risk_events_select_own"
on public.risk_events
for select
to authenticated
using (auth.uid() = user_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'bot_settings',
    'bot_commands',
    'signals',
    'orders',
    'fills',
    'positions',
    'equity_snapshots',
    'daily_metrics',
    'risk_events'
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
