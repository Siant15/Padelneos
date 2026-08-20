-- ============================================================
-- Las apuestas se pueden hacer hasta la hora del partido. El trigger
-- de la migración 009 solo bloqueaba por closes_at manual o mercado
-- resuelto; si un mercado no tenía closes_at, se podía apostar sin
-- límite de tiempo (aunque la UI ya lo bloqueaba, no la BD). Ahora el
-- corte por defecto es la fecha de la jornada + la hora habitual de
-- la temporada.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

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
    (r.scheduled_date + coalesce(s.match_time, '23:59:59'::time)) at time zone 'Europe/Madrid'
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
