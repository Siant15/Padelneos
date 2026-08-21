-- ============================================================
-- Las preguntas de tipo "Jugador" (player_choice) crean una opción
-- por cada jugador registrado EN ESE MOMENTO. Si alguien se registra
-- después, no aparecía como opción en las preguntas ya creadas y sin
-- resolver. Con un trigger, en cuanto se registra un jugador nuevo se
-- le añade automáticamente como opción a esas preguntas abiertas
-- (nunca se puede apostar por uno mismo, igual que al resto).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function add_new_player_to_open_markets()
returns trigger as $$
begin
  insert into betting_options (market_id, label, player_id, is_self_negative)
  select m.id, new.name, new.id, true
  from betting_markets m
  where m.type = 'player_choice' and m.resolved = false;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_add_new_player_to_open_markets on profiles;
create trigger trg_add_new_player_to_open_markets
  after insert on profiles
  for each row execute function add_new_player_to_open_markets();
