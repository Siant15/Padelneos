-- ============================================================
-- Gestión de liga contextual desde Calendario: crear, ampliar y
-- cambiar de temporada se hacen con funciones atómicas (una sola
-- transacción por llamada) en vez de varias peticiones sueltas desde
-- el cliente. Así, si algo falla a mitad no queda una liga a medio
-- generar, y una doble pulsación no duplica jornadas (round_number es
-- único por temporada y usamos ON CONFLICT DO NOTHING).
--
-- Cambio de modelo: día/hora/club dejan de generarse automáticamente
-- para toda la temporada de golpe (ya no hay "hora habitual" ni
-- "fecha de inicio" de la liga). Cada jornada nace sin fecha y se
-- rellena jornada a jornada desde su edición — así una jornada sin
-- día, hora o club puede mostrarse como "Pendiente de reserva".
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

alter table rounds alter column scheduled_date drop not null;
alter table seasons alter column start_date set default current_date;

-- Solo puede haber una temporada activa a la vez, a nivel de base de
-- datos (no solo por convención de la app).
create unique index if not exists seasons_one_active
  on seasons (status)
  where status = 'active';

-- Genera las jornadas [p_from_number..p_to_number] de una temporada,
-- con emparejamiento y responsable de reserva rotando de forma
-- continua según el número absoluto de jornada (para que ampliar una
-- liga siga la rotación justo donde se quedó). Requiere exactamente
-- 4 jugadores registrados. Idempotente: si una jornada ya existe
-- (mismo season_id + round_number), se omite en vez de duplicarla.
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
    end if;
    v_round_id := null;
  end loop;
end;
$$;

-- Amplía la temporada activa a p_new_min_matches partidos en total,
-- generando solo las jornadas que faltan (la rotación de parejas y de
-- responsable continúa desde la última jornada existente). No toca
-- las jornadas ya creadas, ni sus resultados, reservas o apuestas.
create or replace function extend_active_season(p_new_min_matches int)
returns void
language plpgsql
as $$
declare
  v_season_id uuid;
  v_current_min int;
  v_max_existing int;
begin
  select id, min_matches into v_season_id, v_current_min
  from seasons
  where status = 'active'
  order by created_at desc
  limit 1
  for update;

  if v_season_id is null then
    raise exception 'No hay una temporada activa';
  end if;
  if p_new_min_matches <= v_current_min then
    raise exception 'El nuevo número de partidos (%) debe ser mayor que el actual (%)', p_new_min_matches, v_current_min;
  end if;

  select coalesce(max(round_number), 0) into v_max_existing from rounds where season_id = v_season_id;

  update seasons set min_matches = p_new_min_matches where id = v_season_id;
  perform generate_season_rounds(v_season_id, v_max_existing + 1, p_new_min_matches);
end;
$$;

-- Cierra la temporada activa (si existe) y crea una nueva desde cero,
-- generando ya sus jornadas. La clasificación y apuestas de la
-- anterior quedan intactas (sus vistas se filtran por season_id); la
-- nueva empieza sin nada porque no hay jornadas/partidos con su id
-- todavía.
create or replace function start_new_season(p_name text, p_min_matches int)
returns uuid
language plpgsql
as $$
declare
  v_new_id uuid;
begin
  if p_min_matches < 1 then
    raise exception 'El número de partidos debe ser mayor que 0';
  end if;

  update seasons set status = 'finished' where status = 'active';

  insert into seasons (name, min_matches, status)
  values (p_name, p_min_matches, 'active')
  returning id into v_new_id;

  perform generate_season_rounds(v_new_id, 1, p_min_matches);
  return v_new_id;
end;
$$;

grant execute on function generate_season_rounds(uuid, int, int) to authenticated;
grant execute on function extend_active_season(int) to authenticated;
grant execute on function start_new_season(text, int) to authenticated;
