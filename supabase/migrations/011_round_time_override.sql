-- ============================================================
-- No siempre se puede jugar a la hora habitual de la temporada (pista
-- ocupada, imprevistos...). Añadimos una hora opcional por jornada que,
-- si se rellena, manda sobre la hora habitual solo para ese partido -
-- el resto de jornadas no se ven afectadas.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

alter table rounds add column if not exists scheduled_time time;

-- El cierre de apuestas (migración 010) debe usar la hora concreta de
-- la jornada si existe, y si no la hora habitual de la temporada.
create or replace function check_market_open()
returns trigger as $$
declare
  v_resolved boolean;
  v_closes_at timestamptz;
  v_match_datetime timestamptz;
begin
  select
    m.resolved,
    m.closes_at,
    (r.scheduled_date + coalesce(r.scheduled_time, s.match_time, '23:59:59'::time)) at time zone 'Europe/Madrid'
  into v_resolved, v_closes_at, v_match_datetime
  from betting_markets m
  join rounds r on r.id = m.round_id
  join seasons s on s.id = r.season_id
  where m.id = coalesce(new.market_id, old.market_id);

  if v_resolved then
    raise exception 'No se puede apostar en un mercado ya resuelto';
  end if;
  if coalesce(v_closes_at, v_match_datetime) <= now() then
    raise exception 'El plazo para apostar en este mercado ya ha cerrado';
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql security definer;
