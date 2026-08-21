-- ============================================================
-- Al volver a ejecutar 017_calendar_management.sql (para recuperar
-- extend_active_season, que faltaba) se sobrescribió sin querer la
-- versión de generate_season_rounds de la migración 018, que es la
-- que instancia las preguntas de apuestas automáticas para cada
-- jornada nueva. La restauramos aquí, idéntica a la de 018.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function generate_season_rounds(p_season_id uuid, p_from_number int, p_to_number int)
returns void
language plpgsql
as $$
declare
  v_players uuid[];
  v_n int;
  v_pairing int;
  v_booker uuid;
  v_team1_p1 uuid;
  v_team1_p2 uuid;
  v_team2_p1 uuid;
  v_team2_p2 uuid;
  v_round_id uuid;
begin
  if not exists (select 1 from seasons where id = p_season_id) then
    raise exception 'Temporada no encontrada';
  end if;

  select array_agg(id order by created_at) into v_players from profiles;
  if v_players is null or array_length(v_players, 1) is distinct from 4 then
    raise exception 'Se necesitan exactamente 4 jugadores registrados (hay %)', coalesce(array_length(v_players, 1), 0);
  end if;

  for v_n in p_from_number..p_to_number loop
    v_pairing := (v_n - 1) % 3;
    v_booker := v_players[((v_n - 1) % 4) + 1];

    if v_pairing = 0 then
      v_team1_p1 := v_players[1]; v_team1_p2 := v_players[2]; v_team2_p1 := v_players[3]; v_team2_p2 := v_players[4];
    elsif v_pairing = 1 then
      v_team1_p1 := v_players[1]; v_team1_p2 := v_players[3]; v_team2_p1 := v_players[2]; v_team2_p2 := v_players[4];
    else
      v_team1_p1 := v_players[1]; v_team1_p2 := v_players[4]; v_team2_p1 := v_players[2]; v_team2_p2 := v_players[3];
    end if;

    insert into rounds (season_id, round_number, court_booker_id, court_confirmed, status)
    values (p_season_id, v_n, v_booker, false, 'scheduled')
    on conflict (season_id, round_number) do nothing
    returning id into v_round_id;

    if v_round_id is not null then
      insert into matches (round_id, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id)
      values (v_round_id, v_team1_p1, v_team1_p2, v_team2_p1, v_team2_p2);

      perform instantiate_round_questions(v_round_id);
    end if;
    v_round_id := null;
  end loop;
end;
$$;

-- Rellena las preguntas que le faltan a las jornadas de la temporada
-- ACTIVA que ya tengan partido pero se quedaron sin ellas por este bug
-- (idempotente: instantiate_round_questions no duplica si ya existen).
-- No se toca ninguna temporada ya cerrada.
do $$
declare
  v_round record;
begin
  for v_round in
    select r.id from rounds r
    join matches m on m.round_id = r.id
    join seasons s on s.id = r.season_id
    where s.status = 'active'
      and not exists (select 1 from betting_markets bm where bm.round_id = r.id)
  loop
    perform instantiate_round_questions(v_round.id);
  end loop;
end;
$$;
