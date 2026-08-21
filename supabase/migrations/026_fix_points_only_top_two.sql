-- ============================================================
-- El reparto de puntos repartía el "hueco" de puntos entre todo un
-- grupo empatado aunque ese grupo incluyera a jugadores del 2º al 4º
-- puesto (p. ej. 3 jugadores empatados en 2º-3º-4º se llevaban 0,17
-- pts cada uno). La regla correcta es más simple y siempre la misma:
-- SIEMPRE ganan puntos exactamente 2 jugadores (el 1º y el 2º por
-- fichas), nunca los otros 2 — el empate solo se reparte a partes
-- iguales cuando el 1º y el 2º puesto están empatados ENTRE ELLOS
-- (fichas, aciertos y rentabilidad idénticos), nunca extendiéndose al
-- 3º o 4º.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function settle_round(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_season_id uuid;
  v_new_version int;
  v_market record;
  v_total_pot int;
  v_winner_total int;
  v_jackpot record;
  v_jackpot_id uuid;
  v_jackpot_bonus int;
  v_full_pot int;
begin
  perform pg_advisory_xact_lock(hashtext('settle_round:' || p_round_id::text));

  select season_id into v_season_id from rounds where id = p_round_id;
  if v_season_id is null then
    raise exception 'Jornada no encontrada';
  end if;
  if not exists (select 1 from betting_markets where round_id = p_round_id) then
    raise exception 'Esta jornada no tiene preguntas de apuestas';
  end if;
  if exists (select 1 from betting_markets where round_id = p_round_id and not resolved) then
    raise exception 'Todavía hay preguntas sin resolver o anular en esta jornada';
  end if;

  select coalesce(max(version), 0) + 1 into v_new_version from round_settlements where round_id = p_round_id;

  update jackpots j set chips = j.chips + coalesce((
    select sum(case when jc.direction = 'out' then jc.chips else -jc.chips end)
    from jackpot_contributions jc
    where jc.round_id = p_round_id and jc.jackpot_id = j.id and jc.reason <> 'season_refund'
  ), 0), updated_at = now()
  where exists (
    select 1 from jackpot_contributions jc
    where jc.round_id = p_round_id and jc.jackpot_id = j.id and jc.reason <> 'season_refund'
  );

  delete from jackpot_contributions where round_id = p_round_id and reason <> 'season_refund';
  update round_settlements set voided_at = now() where round_id = p_round_id and voided_at is null;

  create temporary table tmp_round_net (
    player_id uuid primary key,
    net int not null default 0,
    bet int not null default 0,
    prize int not null default 0,
    correct int not null default 0,
    markets_bet int not null default 0
  ) on commit drop;

  insert into tmp_round_net (player_id) select id from profiles;

  for v_market in select * from betting_markets where round_id = p_round_id loop
    select coalesce(sum(chips), 0) into v_total_pot from bets where market_id = v_market.id;
    if v_total_pot = 0 then
      continue;
    end if;

    update tmp_round_net t set bet = t.bet + b.chips, markets_bet = t.markets_bet + 1
      from bets b where b.market_id = v_market.id and b.player_id = t.player_id;

    if v_market.voided then
      continue;
    end if;

    if v_market.winning_option_id is not null then
      select coalesce(sum(chips), 0) into v_winner_total from bets where market_id = v_market.id and option_id = v_market.winning_option_id;
    else
      v_winner_total := 0;
    end if;

    if v_winner_total = 0 then
      update tmp_round_net t set net = t.net - b.chips
        from bets b where b.market_id = v_market.id and b.player_id = t.player_id;

      insert into jackpots (template_id, season_id, chips)
      values (v_market.template_id, v_season_id, v_total_pot)
      on conflict (template_id, season_id) do update set chips = jackpots.chips + excluded.chips, updated_at = now()
      returning id into v_jackpot_id;

      insert into jackpot_contributions (jackpot_id, round_id, player_id, chips, direction, reason)
      select v_jackpot_id, p_round_id, b.player_id, b.chips, 'in', 'rollover'
      from bets b where b.market_id = v_market.id;

      continue;
    end if;

    select * into v_jackpot from jackpots where template_id = v_market.template_id and season_id = v_season_id;
    v_jackpot_bonus := coalesce(v_jackpot.chips, 0);
    v_full_pot := v_total_pot + v_jackpot_bonus;

    if v_jackpot_bonus > 0 then
      insert into jackpot_contributions (jackpot_id, round_id, player_id, chips, direction, reason)
      values (v_jackpot.id, p_round_id, null, v_jackpot_bonus, 'out', 'payout_consumption');
      update jackpots set chips = 0, updated_at = now() where id = v_jackpot.id;
    end if;

    with winner_bets as (
      select player_id, chips, (chips::numeric / v_winner_total) * v_full_pot as raw_share
      from bets where market_id = v_market.id and option_id = v_market.winning_option_id
    ),
    shares as (
      select player_id, chips, floor(raw_share) as base_share, raw_share - floor(raw_share) as remainder,
             row_number() over (order by raw_share - floor(raw_share) desc, player_id) as rn
      from winner_bets
    ),
    total_base as (select coalesce(sum(base_share), 0) as s from shares)
    update tmp_round_net t
    set net = t.net + (s.base_share + (case when s.rn <= (v_full_pot - tb.s) then 1 else 0 end) - s.chips),
        prize = t.prize + (s.base_share + (case when s.rn <= (v_full_pot - tb.s) then 1 else 0 end)),
        correct = t.correct + 1
    from shares s, total_base tb
    where t.player_id = s.player_id;

    update tmp_round_net t set net = t.net - b.chips
      from bets b where b.market_id = v_market.id and b.option_id <> v_market.winning_option_id and b.player_id = t.player_id;
  end loop;

  -- Ranking final: siempre exactamente 4 puestos distintos (el id de
  -- jugador desempata cualquier triple empate real, para que "pos"
  -- nunca se comparta). Solo se reparten puntos entre el 1º y el 2º
  -- puesto — el 3º y el 4º nunca reciben nada, empaten o no con el 2º.
  with ordered as (
    select t.*, 100 + t.net as chips_final,
           case when t.bet > 0 then t.prize::numeric / t.bet else -1 end as roi
    from tmp_round_net t
  ),
  ranked as (
    select *, row_number() over (order by chips_final desc, correct desc, roi desc, player_id) as pos
    from ordered
  ),
  tie_1_2 as (
    select
      (max(chips_final) filter (where pos = 1)) = (max(chips_final) filter (where pos = 2))
      and (max(correct) filter (where pos = 1)) = (max(correct) filter (where pos = 2))
      and (max(roi) filter (where pos = 1)) = (max(roi) filter (where pos = 2))
      as tied
    from ranked
  )
  insert into betting_round_results (
    round_id, player_id, opening_chips, chips_bet, chips_net, chips_final, chips_won, correct_count, markets_bet_count, point_bonus, rank
  )
  select
    p_round_id, r.player_id, 100, r.bet, r.net, r.chips_final, r.prize, r.correct, r.markets_bet,
    case
      when r.pos = 1 then case when tc.tied then 0.75 else 1 end
      when r.pos = 2 then case when tc.tied then 0.75 else 0.5 end
      else 0
    end,
    r.pos
  from ranked r, tie_1_2 tc
  on conflict (round_id, player_id) do update set
    opening_chips = excluded.opening_chips,
    chips_bet = excluded.chips_bet,
    chips_net = excluded.chips_net,
    chips_final = excluded.chips_final,
    chips_won = excluded.chips_won,
    correct_count = excluded.correct_count,
    markets_bet_count = excluded.markets_bet_count,
    point_bonus = excluded.point_bonus,
    rank = excluded.rank;

  insert into round_settlements (round_id, version) values (p_round_id, v_new_version);
end;
$$;

grant execute on function settle_round(uuid) to authenticated;
