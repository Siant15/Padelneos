-- Las apuestas de pago solo abren con la reserva completa (día, hora y
-- club). La pantalla ya lo exige; aquí se refuerza en la base de datos.
create or replace function place_round_bets(p_round_id uuid, p_bets jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid := auth.uid();
  v_bet jsonb;
  v_market_id uuid;
  v_chips int;
  v_total int := 0;
  v_expected_ids uuid[];
  v_sent_ids uuid[] := '{}';
begin
  if v_player_id is null then
    raise exception 'No autenticado';
  end if;

  select array_agg(bm.id) into v_expected_ids
  from betting_markets bm
  join rounds r on r.id = bm.round_id
  where bm.round_id = p_round_id
    and bm.type <> 'exact_score'
    and not bm.resolved
    and r.scheduled_date is not null
    and r.scheduled_time is not null
    and coalesce(r.club, '') <> ''
    and coalesce(bm.closes_at, (r.scheduled_date + r.scheduled_time) at time zone 'Europe/Madrid') > now();

  if v_expected_ids is null or array_length(v_expected_ids, 1) = 0 then
    raise exception 'No hay preguntas de pago abiertas en esta jornada';
  end if;

  for v_bet in select * from jsonb_array_elements(p_bets)
  loop
    v_market_id := (v_bet ->> 'market_id')::uuid;
    v_chips := (v_bet ->> 'chips')::int;

    if not (v_market_id = any(v_expected_ids)) then
      raise exception 'Esa pregunta no está abierta en esta jornada';
    end if;
    if v_market_id = any(v_sent_ids) then
      raise exception 'Pregunta repetida';
    end if;
    if v_chips < 10 or v_chips > 50 then
      raise exception 'Cada pregunta exige entre 10 y 50 fichas';
    end if;

    v_sent_ids := array_append(v_sent_ids, v_market_id);
    v_total := v_total + v_chips;
  end loop;

  if v_total > 100 then
    raise exception 'El total no puede pasar de 100 fichas (suma actual: %)', v_total;
  end if;

  delete from bets where player_id = v_player_id and market_id = any(v_expected_ids);

  for v_bet in select * from jsonb_array_elements(p_bets)
  loop
    insert into bets (market_id, option_id, player_id, chips)
    values ((v_bet ->> 'market_id')::uuid, (v_bet ->> 'option_id')::uuid, v_player_id, (v_bet ->> 'chips')::int);
  end loop;
end;
$$;
