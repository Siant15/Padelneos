-- ============================================================
-- check_market_open() se ejecuta también al BORRAR una apuesta (el
-- trigger es "before insert or update or delete"), así que bloqueaba
-- cualquier borrado en cascada de bets al eliminar una jornada, un
-- mercado ya resuelto, o una jornada sin día/hora — casos que no
-- tienen nada que ver con "intentar apostar fuera de plazo". El
-- cierre de apuestas solo debe validarse al crear o modificar una
-- apuesta, nunca al borrarla.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function check_market_open()
returns trigger as $$
declare
  v_resolved boolean;
  v_closes_at timestamptz;
  v_scheduled_date date;
  v_scheduled_time time;
  v_match_datetime timestamptz;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select m.resolved, m.closes_at, r.scheduled_date, r.scheduled_time
    into v_resolved, v_closes_at, v_scheduled_date, v_scheduled_time
  from betting_markets m
  join rounds r on r.id = m.round_id
  where m.id = new.market_id;

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

  return new;
end;
$$ language plpgsql security definer;
