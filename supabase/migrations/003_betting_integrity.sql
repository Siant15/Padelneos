-- ============================================================
-- Integridad de apuestas: auto-apuesta explícita + límite de fichas real
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Marca explícita de "no se puede apostar por/contra uno mismo" en vez de
-- detectar palabras clave en el texto de la pregunta.
alter table betting_options
  add column if not exists is_self_negative boolean default false;

-- ------------------------------------------------------------
-- Límite de 100 fichas por jugador y jornada, forzado en la BD
-- (antes solo se validaba en el cliente).
-- ------------------------------------------------------------
create or replace function check_chips_budget()
returns trigger as $$
declare
  v_round_id uuid;
  v_total int;
begin
  select round_id into v_round_id from betting_markets where id = new.market_id;

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

drop trigger if exists trg_check_chips_budget on bets;
create trigger trg_check_chips_budget
  before insert or update on bets
  for each row execute function check_chips_budget();
