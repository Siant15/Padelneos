-- ============================================================
-- La validación de marcador (reglas reales de pádel) solo existía en
-- el cliente. Cualquiera con acceso a la API podía grabar un
-- resultado imposible. Replicamos la misma validación en la BD.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function is_valid_padel_set(a int, b int)
returns boolean as $$
begin
  if a is null or b is null then return false; end if;
  if greatest(a,b) = 6 and least(a,b) <= 4 then return true; end if;
  if greatest(a,b) = 7 and least(a,b) in (5, 6) then return true; end if;
  return false;
end;
$$ language plpgsql immutable;

create or replace function check_match_score()
returns trigger as $$
declare
  w1 text;
  w2 text;
  w3 text;
  expected text;
begin
  -- Sin resultado todavía: no hay nada que validar.
  if new.winner is null then
    return new;
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

drop trigger if exists trg_check_match_score on matches;
create trigger trg_check_match_score
  before insert or update on matches
  for each row execute function check_match_score();
