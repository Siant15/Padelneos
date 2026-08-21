-- ============================================================
-- Endurece las validaciones de apuestas en la BD (no solo en la UI):
--   - No apostar por/contra uno mismo, también a nivel de servidor.
--   - El límite de 100 fichas por jornada no se puede saltar con dos
--     peticiones simultáneas (bloqueo por jugador+jornada).
--   - No se puede apostar en una jornada sin día y hora confirmados.
-- Añade además las columnas que necesita la liquidación centralizada
-- (020_betting_settlement_and_jackpots.sql).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Auto-apuesta bloqueada también en servidor (antes solo la
--    ocultaba la UI). Se apoya en betting_options.is_self_negative,
--    que ya existía (migración 003).
-- ------------------------------------------------------------
create or replace function check_self_bet()
returns trigger as $$
declare
  v_option record;
begin
  select player_id, is_self_negative into v_option from betting_options where id = new.option_id;
  if v_option.is_self_negative and v_option.player_id = new.player_id then
    raise exception 'No puedes apostar por ti mismo en esta pregunta';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_check_self_bet on bets;
create trigger trg_check_self_bet
  before insert or update on bets
  for each row execute function check_self_bet();

-- ------------------------------------------------------------
-- 2. Límite de 100 fichas: bloqueo por (jornada, jugador) antes de
--    sumar, para que dos apuestas a la vez no puedan superarlo entre
--    las dos (antes había una ventana de carrera real).
-- ------------------------------------------------------------
create or replace function check_chips_budget()
returns trigger as $$
declare
  v_round_id uuid;
  v_total int;
begin
  select round_id into v_round_id from betting_markets where id = new.market_id;

  perform pg_advisory_xact_lock(hashtext(v_round_id::text || new.player_id::text));

  select coalesce(sum(b.chips), 0) into v_total
  from bets b
  join betting_markets m on m.id = b.market_id
  where m.round_id = v_round_id
    and b.player_id = new.player_id
    and b.id is distinct from new.id;

  if v_total + new.chips > 100 then
    raise exception 'Límite de 100 fichas por jornada superado (ya tienes % apostadas)', v_total;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- (el trigger trg_check_chips_budget ya existe desde la migración 003
-- y sigue apuntando a esta misma función, no hace falta recrearlo)

-- ------------------------------------------------------------
-- 3. No se puede apostar en una jornada sin día y hora confirmados
--    (antes, si faltaban, se dejaba abierto hasta las 23:59:59 de la
--    fecha — y si tampoco había fecha, sin cierre en absoluto).
-- ------------------------------------------------------------
create or replace function check_market_open()
returns trigger as $$
declare
  v_resolved boolean;
  v_closes_at timestamptz;
  v_scheduled_date date;
  v_scheduled_time time;
  v_match_datetime timestamptz;
begin
  select m.resolved, m.closes_at, r.scheduled_date, r.scheduled_time
    into v_resolved, v_closes_at, v_scheduled_date, v_scheduled_time
  from betting_markets m
  join rounds r on r.id = m.round_id
  where m.id = coalesce(new.market_id, old.market_id);

  if v_resolved then
    raise exception 'No se puede apostar en un mercado ya resuelto';
  end if;

  if v_closes_at is null then
    if v_scheduled_date is null or v_scheduled_time is null then
      raise exception 'Esta jornada todavía no tiene día y hora confirmados: no se puede apostar aún';
    end if;
    v_match_datetime := (v_scheduled_date + v_scheduled_time) at time zone 'Europe/Madrid';
  end if;

  if coalesce(v_closes_at, v_match_datetime) <= now() then
    raise exception 'El plazo para apostar en este mercado ya ha cerrado';
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- ------------------------------------------------------------
-- 4. betting_round_results: columnas que faltan para reflejar de
--    verdad "100 iniciales − apostadas + recibidas = finales", y
--    control de idempotencia de la liquidación por jornada.
-- ------------------------------------------------------------
alter table betting_round_results drop column if exists chips_total; -- nunca se escribía
alter table betting_round_results add column if not exists opening_chips int not null default 100;
alter table betting_round_results add column if not exists chips_bet int not null default 0;
alter table betting_round_results add column if not exists chips_final int not null default 100;
alter table betting_round_results add column if not exists chips_won int not null default 0; -- premios brutos (antes de restar lo apostado)
alter table betting_round_results add column if not exists correct_count int not null default 0;
alter table betting_round_results add column if not exists markets_bet_count int not null default 0;

-- Una fila por cada liquidación realizada (no solo la vigente): si se
-- corrige un resultado y se vuelve a liquidar, la fila anterior se
-- marca voided_at en vez de borrarse, para que quede rastro auditable.
create table if not exists round_settlements (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid references rounds on delete cascade not null,
  version int not null default 1,
  settled_at timestamptz not null default now(),
  voided_at timestamptz
);

create unique index if not exists round_settlements_one_live
  on round_settlements (round_id)
  where voided_at is null;

alter table round_settlements enable row level security;
create policy "Liquidaciones visibles para autenticados" on round_settlements for select to authenticated using (true);
create policy "Liquidaciones editables por autenticados" on round_settlements for all to authenticated using (true);
