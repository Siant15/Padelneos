-- ============================================================
-- 4ª ronda de auditoría. Ejecutar en Supabase SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Un partido de pádel al mejor de 3 sets nunca puede acabar en
--    empate, pero el trigger de la migración 008 lo dejaba entrar
--    en el "else" y fallaba con un mensaje confuso ("el ganador no
--    coincide con el resultado de los sets"). Lo rechazamos ahora
--    de forma explícita con un mensaje claro.
-- ------------------------------------------------------------
create or replace function check_match_score()
returns trigger as $$
declare
  w1 text;
  w2 text;
  w3 text;
  expected text;
begin
  if new.winner is null then
    return new;
  end if;

  if new.winner = 'draw' then
    raise exception 'Un partido de pádel al mejor de 3 sets no puede acabar en empate';
  end if;

  if not is_valid_padel_set(new.set1_t1, new.set1_t2) then
    raise exception 'Set 1 no es un marcador válido de pádel (%-%)', new.set1_t1, new.set1_t2;
  end if;
  if not is_valid_padel_set(new.set2_t1, new.set2_t2) then
    raise exception 'Set 2 no es un marcador válido de pádel (%-%)', new.set2_t1, new.set2_t2;
  end if;

  w1 := case when new.set1_t1 > new.set1_t2 then 'team1' else 'team2' end;
  w2 := case when new.set2_t1 > new.set2_t2 then 'team1' else 'team2' end;

  if w1 = w2 then
    if new.set3_t1 is not null or new.set3_t2 is not null then
      raise exception 'El partido ya está decidido en 2 sets, no debe haber un 3.º set';
    end if;
    expected := w1;
  else
    if not is_valid_padel_set(new.set3_t1, new.set3_t2) then
      raise exception 'El partido está 1-1 en sets: hace falta un 3.º set válido';
    end if;
    w3 := case when new.set3_t1 > new.set3_t2 then 'team1' else 'team2' end;
    expected := w3;
  end if;

  if new.winner <> expected then
    raise exception 'El ganador (%) no coincide con el resultado de los sets (debería ser %)', new.winner, expected;
  end if;

  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- 2. Un jugador podía editar/borrar su propia apuesta llamando
--    directamente a la API de Supabase después de que el mercado
--    se resolviera o cerrara por fecha, saltándose la UI. Lo
--    bloqueamos también en la BD.
-- ------------------------------------------------------------
create or replace function check_market_open()
returns trigger as $$
declare
  v_resolved boolean;
  v_closes_at timestamptz;
begin
  select resolved, closes_at into v_resolved, v_closes_at
  from betting_markets where id = coalesce(new.market_id, old.market_id);

  if v_resolved then
    raise exception 'No se puede apostar en un mercado ya resuelto';
  end if;
  if v_closes_at is not null and v_closes_at <= now() then
    raise exception 'El plazo para apostar en este mercado ya ha cerrado';
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists trg_check_market_open on bets;
create trigger trg_check_market_open
  before insert or update or delete on bets
  for each row execute function check_market_open();
