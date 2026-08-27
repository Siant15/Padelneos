-- ============================================================
-- Auditoría: la migración 027 hizo que check_market_open() dejara
-- pasar CUALQUIER DELETE sin comprobar nada, para no bloquear el
-- borrado en cascada de apuestas al eliminar una jornada/mercado. Pero
-- eso también abrió la puerta a que un jugador borrase a mano una
-- apuesta suya YA PERDEDORA después de que el mercado cerrara o se
-- resolviera, escapando de la pérdida antes de que se liquide la
-- jornada — nada en el servidor lo impedía, solo el botón de la UI
-- (canBet), saltable llamando al mismo cliente de Supabase.
--
-- Este fix distingue los dos casos: si el mercado referenciado por la
-- apuesta YA NO EXISTE (se está borrando en cascada junto con su
-- jornada), se deja pasar igual que antes. Si el mercado SIGUE
-- existiendo, se aplican las mismas reglas que al apostar: no se
-- puede borrar una apuesta de un mercado ya resuelto ni fuera de
-- plazo.
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
      -- El mercado ya no existe: borrado en cascada de la jornada o el
      -- mercado, no un jugador borrando su apuesta a mano.
      return old;
    end if;
    if v_resolved then
      raise exception 'No se puede borrar una apuesta de un mercado ya resuelto';
    end if;
    if v_scheduled_date is not null and v_scheduled_time is not null then
      v_match_datetime := (v_scheduled_date + v_scheduled_time) at time zone 'Europe/Madrid';
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
    v_match_datetime := (v_scheduled_date + v_scheduled_time) at time zone 'Europe/Madrid';
  end if;

  if coalesce(v_closes_at, v_match_datetime) <= now() then
    raise exception 'El plazo para apostar en este mercado ya ha cerrado';
  end if;

  return new;
end;
$$ language plpgsql security definer;
