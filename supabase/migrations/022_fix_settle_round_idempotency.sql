-- ============================================================
-- settle_round() intentaba "borrar todo y volver a insertar" al
-- reliquidar una jornada ya liquidada, pero eso chocaba con la
-- restricción unique(round_id, player_id) de betting_round_results al
-- volver a insertar. Lo hacemos con upsert (ON CONFLICT DO UPDATE):
-- así el resultado final es correcto independientemente de si el
-- borrado anterior se aplicó o no, y repetir la liquidación es
-- siempre seguro.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function settle_round(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_season_id uuid;
  v_prev record;
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

  -- Deshacer una liquidación previa (corrección de resultado) antes de recalcular.
  select * into v_prev from round_settlements where round_id = p_round_id and voided_at is null;
  if v_prev is not null then
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
    update round_settlements set voided_at = now() where id = v_prev.id;
  end if;

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

  with ordered as (
    select t.*, 100 + t.net as chips_final,
           case when t.bet > 0 then t.prize::numeric / t.bet else -1 end as roi
    from tmp_round_net t
  ),
  positioned as (
    select *, row_number() over (order by chips_final desc, correct desc, roi desc) as pos
    from ordered
  ),
  grouped as (
    select *, dense_rank() over (order by chips_final desc, correct desc, roi desc) as grp
    from positioned
  ),
  bonuses as (
    select pos, (array[1, 0.5, 0, 0])[pos] as bonus from generate_series(1, 4) as pos
  ),
  grp_bonus as (
    select g.grp, avg(b.bonus) as avg_bonus
    from grouped g join bonuses b on b.pos = g.pos
    group by g.grp
  )
  insert into betting_round_results (
    round_id, player_id, opening_chips, chips_bet, chips_net, chips_final, chips_won, correct_count, markets_bet_count, point_bonus, rank
  )
  select p_round_id, g.player_id, 100, g.bet, g.net, g.chips_final, g.prize, g.correct, g.markets_bet, gb.avg_bonus, g.pos
  from grouped g join grp_bonus gb on gb.grp = g.grp
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

  insert into round_settlements (round_id, version)
  values (p_round_id, coalesce(v_prev.version, 0) + 1);
end;
$$;

grant execute on function settle_round(uuid) to authenticated;
