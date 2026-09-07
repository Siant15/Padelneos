-- ============================================================
-- Parte D del rediseño del motor de apuestas: el mercado (cuando no
-- tiene closes_at explícito) cierra 1h antes del partido, no justo a
-- la hora de inicio — coincide con lib/betting.ts::marketCloseTime.
-- ============================================================
create or replace function check_market_open()
returns trigger as $$
declare
  v_resolved boolean;
  v_closes_at timestamptz;
  v_scheduled_date date;
  v_scheduled_time time;
  v_match_datetime timestamptz;
  v_market_id uuid;
  v_found boolean;
begin
  v_market_id := coalesce(new.market_id, old.market_id);

  select m.resolved, m.closes_at, r.scheduled_date, r.scheduled_time, true
    into v_resolved, v_closes_at, v_scheduled_date, v_scheduled_time, v_found
  from betting_markets m
  join rounds r on r.id = m.round_id
  where m.id = v_market_id;

  if tg_op = 'DELETE' then
    if v_found is null then
      return old;
    end if;
    if v_resolved then
      raise exception 'No se puede borrar una apuesta de un mercado ya resuelto';
    end if;
    if v_scheduled_date is not null and v_scheduled_time is not null then
      v_match_datetime := (v_scheduled_date + v_scheduled_time) at time zone 'Europe/Madrid' - interval '1 hour';
    end if;
    if coalesce(v_closes_at, v_match_datetime) is not null and coalesce(v_closes_at, v_match_datetime) <= now() then
      raise exception 'El plazo para apostar en este mercado ya ha cerrado';
    end if;
    return old;
  end if;

  if v_resolved then
    raise exception 'No se puede apostar en un mercado ya resuelto';
  end if;

  if v_closes_at is null then
    if v_scheduled_date is null or v_scheduled_time is null then
      raise exception 'Esta jornada todavía no tiene día y hora confirmados: no se puede apostar aún';
    end if;
    v_match_datetime := (v_scheduled_date + v_scheduled_time) at time zone 'Europe/Madrid' - interval '1 hour';
  end if;

  if coalesce(v_closes_at, v_match_datetime) <= now() then
    raise exception 'El plazo para apostar en este mercado ya ha cerrado';
  end if;

  return new;
end;
$$ language plpgsql security definer;
