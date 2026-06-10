alter table public.bot_settings
  alter column timeframe set default '5m',
  alter column max_concurrent_positions set default 2,
  alter column max_symbol_allocation_pct set default 5,
  alter column max_total_exposure_pct set default 10,
  alter column daily_drawdown_limit_pct set default 1,
  alter column weekly_drawdown_limit_pct set default 3,
  alter column strategy_version set default 'intraday-rules-cost-managed-v2';

update public.bot_settings
set
  desired_mode = 'paper',
  actual_mode = 'paper',
  is_running = false,
  symbols = array['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  timeframe = '5m',
  decision_interval_minutes = 5,
  paper_trade_notional = 50,
  live_trade_notional = 25,
  max_concurrent_positions = 2,
  max_symbol_allocation_pct = 5,
  max_total_exposure_pct = 10,
  daily_drawdown_limit_pct = 1,
  weekly_drawdown_limit_pct = 3,
  strategy_version = 'intraday-rules-cost-managed-v2';
