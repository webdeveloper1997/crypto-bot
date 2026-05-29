alter table public.signals
  add column if not exists mode text;

alter table public.fills
  add column if not exists mode text;

update public.signals as s
set mode = coalesce(
  (
    select o.broker_mode
    from public.orders as o
    where o.signal_id = s.id
    order by o.placed_at asc
    limit 1
  ),
  (
    select p.mode
    from public.positions as p
    where p.signal_id = s.id
    order by p.opened_at asc
    limit 1
  ),
  (
    select (bc.payload ->> 'targetMode')
    from public.bot_commands as bc
    where bc.user_id = s.user_id
      and bc.command_type = 'switch_mode'
      and bc.status = 'applied'
      and coalesce(bc.processed_at, bc.requested_at) <= s.generated_at
    order by coalesce(bc.processed_at, bc.requested_at) desc
    limit 1
  ),
  'paper'
)
where s.mode is null;

update public.fills as f
set mode = o.broker_mode
from public.orders as o
where o.id = f.order_id
  and f.mode is null;

alter table public.signals
  alter column mode set default 'paper';

alter table public.fills
  alter column mode set default 'paper';

update public.fills
set mode = 'paper'
where mode is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'signals_mode_check'
      and conrelid = 'public.signals'::regclass
  ) then
    alter table public.signals
      add constraint signals_mode_check
      check (mode in ('paper', 'testnet', 'live'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fills_mode_check'
      and conrelid = 'public.fills'::regclass
  ) then
    alter table public.fills
      add constraint fills_mode_check
      check (mode in ('paper', 'testnet', 'live'));
  end if;
end
$$;

alter table public.signals
  alter column mode set not null;

alter table public.fills
  alter column mode set not null;

create index if not exists signals_user_mode_generated_idx
  on public.signals (user_id, mode, generated_at desc);

create index if not exists fills_user_mode_executed_idx
  on public.fills (user_id, mode, executed_at desc);
