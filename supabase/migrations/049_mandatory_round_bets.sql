-- ============================================================
-- Parte C del rediseño del motor de apuestas: cada pregunta de pago
-- de la jornada exige entre 10 y 50 fichas, hay que apostar en TODAS
-- a la vez (nunca dejarse una sin apostar), y la suma debe ser
-- exactamente 100. "Marcador exacto" es gratis (chips=0) y va aparte,
-- con su propio flujo de "busca o crea la opción" ya existente.
--
-- Sustituye el modelo anterior (repartir hasta 100 como se quiera,
-- autoguardado campo a campo) por una única función que valida y
-- guarda TODAS las apuestas de pago de la jornada de una vez.
-- ============================================================

-- El límite de "chips > 0" no vale ya (el marcador exacto es 0); el
-- rango 10-50 (o exactamente 0 para exact_score) se valida con un
-- trigger porque necesita mirar el tipo del mercado, algo que un
-- CHECK de columna no puede hacer.
alter table bets drop constraint if exists bets_chips_check;
alter table bets add constraint bets_chips_check check (chips >= 0);

drop trigger if exists trg_check_chips_budget on bets;

create or replace function check_bet_chips_range()
returns trigger
language plpgsql
as $$
declare
  v_answer_type text;
begin
  select type into v_answer_type from betting_markets where id = new.market_id;
  if v_answer_type = 'exact_score' then
    if new.chips <> 0 then
      raise exception 'El marcador exacto es gratis, no lleva fichas';
    end if;
  else
    if new.chips < 10 or new.chips > 50 then
      raise exception 'Cada pregunta de pago exige entre 10 y 50 fichas';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_bet_chips_range on bets;
create trigger trg_check_bet_chips_range
  before insert or update on bets
  for each row execute function check_bet_chips_range();

-- Guarda de una vez todas las apuestas de pago de la jornada del
-- jugador que llama: p_bets = [{market_id, option_id, chips}, ...],
-- una entrada por cada mercado de pago abierto de la jornada, ni más
-- ni menos, sumando exactamente 100. Sustituye cualquier apuesta
-- previa del jugador en esos mercados (permite corregir mientras el
-- mercado siga abierto).
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
  v_option_id uuid;
  v_chips int;
  v_total int := 0;
  v_sent_count int := 0;
  v_expected_ids uuid[];
  v_sent_ids uuid[] := '{}';
begin
  if v_player_id is null then
    raise exception 'No autenticado';
  end if;

  -- Mercados de pago abiertos de esta jornada ahora mismo (todo menos
  -- exact_score, no resuelto, dentro de plazo).
  select array_agg(bm.id) into v_expected_ids
  from betting_markets bm
  join rounds r on r.id = bm.round_id
  where bm.round_id = p_round_id
    and bm.type <> 'exact_score'
    and not bm.resolved
    and coalesce(bm.closes_at, (r.scheduled_date + r.scheduled_time) at time zone 'Europe/Madrid') > now();

  if v_expected_ids is null or array_length(v_expected_ids, 1) = 0 then
    raise exception 'No hay preguntas de pago abiertas en esta jornada';
  end if;

  for v_bet in select * from jsonb_array_elements(p_bets)
  loop
    v_market_id := (v_bet ->> 'market_id')::uuid;
    v_option_id := (v_bet ->> 'option_id')::uuid;
    v_chips := (v_bet ->> 'chips')::int;

    if not (v_market_id = any(v_expected_ids)) then
      raise exception 'Esa pregunta no está abierta en esta jornada';
    end if;
    if v_chips < 10 or v_chips > 50 then
      raise exception 'Cada pregunta exige entre 10 y 50 fichas';
    end if;

    v_sent_ids := array_append(v_sent_ids, v_market_id);
    v_total := v_total + v_chips;
    v_sent_count := v_sent_count + 1;
  end loop;

  if v_sent_count <> array_length(v_expected_ids, 1) then
    raise exception 'Hay que apostar en las % preguntas de esta jornada, no en %', array_length(v_expected_ids, 1), v_sent_count;
  end if;
  if v_total <> 100 then
    raise exception 'El total tiene que sumar exactamente 100 fichas (suma actual: %)', v_total;
  end if;

  delete from bets where player_id = v_player_id and market_id = any(v_expected_ids);

  for v_bet in select * from jsonb_array_elements(p_bets)
  loop
    insert into bets (market_id, option_id, player_id, chips)
    values ((v_bet ->> 'market_id')::uuid, (v_bet ->> 'option_id')::uuid, v_player_id, (v_bet ->> 'chips')::int);
  end loop;
end;
$$;

grant execute on function place_round_bets(uuid, jsonb) to authenticated;
