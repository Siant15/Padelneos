-- ============================================================
-- Al crear una liga, si se conoce la fecha del primer partido, se
-- puede extrapolar semana a semana para el resto de jornadas (J1 =
-- esa fecha, J2 = +7 días, J3 = +14 días...) en vez de dejarlas todas
-- "Por confirmar". Parámetro opcional y con default null para no
-- romper la firma existente (start_new_season(p_name, p_min_matches)
-- seguía llamándose así desde el cliente hasta ahora).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function start_new_season(p_name text, p_min_matches int, p_first_match_date date default null)
returns uuid
language plpgsql
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  if p_min_matches < 1 then
    raise exception 'El número de partidos debe ser mayor que 0';
  end if;

  select id into v_old_id from seasons where status = 'active' order by created_at desc limit 1;
  if v_old_id is not null then
    perform close_season_jackpots(v_old_id);
  end if;

  update seasons set status = 'finished' where status = 'active';

  insert into seasons (name, min_matches, status)
  values (p_name, p_min_matches, 'active')
  returning id into v_new_id;

  perform generate_season_rounds(v_new_id, 1, p_min_matches);

  if p_first_match_date is not null then
    update rounds
    set scheduled_date = p_first_match_date + ((round_number - 1) * 7)
    where season_id = v_new_id;
  end if;

  return v_new_id;
end;
$$;

grant execute on function start_new_season(text, int, date) to authenticated;
