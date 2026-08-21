-- ============================================================
-- Corrige datos reales de la liga activa:
--   1. J2-J9 se crearon cuando todavía no había 4 jugadores
--      registrados, así que nunca recibieron pareja ni preguntas de
--      apuestas (J1 sí las tiene, y ya está jugada, no se toca). Se
--      les asigna ahora el emparejamiento y el responsable de reserva
--      con la misma rotación de siempre, y se instancian sus preguntas.
--   2. Borra J10 y J11 (jornadas de prueba usadas para verificar el
--      sistema de apuestas) y cualquier dato de apuestas/jackpot que
--      generaron, y devuelve la temporada a 9 partidos.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

do $$
declare
  v_season_id uuid;
  v_players uuid[];
  v_round record;
  v_pairing int;
  v_booker uuid;
  v_team1_p1 uuid;
  v_team1_p2 uuid;
  v_team2_p1 uuid;
  v_team2_p2 uuid;
begin
  select id into v_season_id from seasons where status = 'active' order by created_at desc limit 1;
  if v_season_id is null then
    raise notice 'No hay temporada activa, nada que corregir.';
    return;
  end if;

  select array_agg(id order by created_at) into v_players from profiles;
  if v_players is null or array_length(v_players, 1) is distinct from 4 then
    raise exception 'Se necesitan exactamente 4 jugadores registrados (hay %)', coalesce(array_length(v_players, 1), 0);
  end if;

  -- 1. Rellenar pareja + responsable de las jornadas sin partido
  --    (excepto jornadas ya jugadas, que no se tocan).
  for v_round in
    select r.id, r.round_number
    from rounds r
    where r.season_id = v_season_id
      and r.status <> 'played'
      and not exists (select 1 from matches m where m.round_id = r.id)
  loop
    v_pairing := (v_round.round_number - 1) % 3;
    v_booker := v_players[((v_round.round_number - 1) % 4) + 1];

    if v_pairing = 0 then
      v_team1_p1 := v_players[1]; v_team1_p2 := v_players[2]; v_team2_p1 := v_players[3]; v_team2_p2 := v_players[4];
    elsif v_pairing = 1 then
      v_team1_p1 := v_players[1]; v_team1_p2 := v_players[3]; v_team2_p1 := v_players[2]; v_team2_p2 := v_players[4];
    else
      v_team1_p1 := v_players[1]; v_team1_p2 := v_players[4]; v_team2_p1 := v_players[2]; v_team2_p2 := v_players[3];
    end if;

    update rounds set court_booker_id = v_booker where id = v_round.id;

    insert into matches (round_id, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id)
    values (v_round.id, v_team1_p1, v_team1_p2, v_team2_p1, v_team2_p2);

    perform instantiate_round_questions(v_round.id);
  end loop;

  -- 2. Borrar las jornadas de prueba J10 y J11 y todo lo que generaron.
  delete from jackpot_contributions jc
    where jc.round_id in (select id from rounds where season_id = v_season_id and round_number in (10, 11));

  -- El jackpot de "Ganador del partido" de esta temporada solo existe
  -- por la apuesta de prueba en J11: lo dejamos a 0 en vez de dejarlo
  -- como si fuera un jackpot real acumulado.
  update jackpots j set chips = 0, updated_at = now()
  where j.season_id = v_season_id
    and not exists (
      select 1 from jackpot_contributions jc
      where jc.jackpot_id = j.id and jc.round_id not in (
        select id from rounds where season_id = v_season_id and round_number in (10, 11)
      )
    );

  delete from rounds where season_id = v_season_id and round_number in (10, 11);
  -- (el borrado en cascada se lleva matches, betting_markets,
  -- betting_options, bets, betting_round_results y round_settlements
  -- de esas dos jornadas)

  update seasons set min_matches = 9 where id = v_season_id;
end;
$$;
