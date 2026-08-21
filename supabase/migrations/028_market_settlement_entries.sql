-- ============================================================
-- El "acta" de la jornada (Liga → Apuestas) necesita mostrar, pregunta
-- por pregunta, quién apostó qué y cuánto ganó exactamente — pero
-- settle_round() solo guardaba el neto agregado de TODA la jornada
-- (betting_round_results), no el desglose por pregunta. En vez de
-- recalcular esos números en el cliente (que duplicaría la lógica de
-- reparto y podría desincronizarse), se guarda el desglose real en
-- una tabla nueva en el mismo momento en que se calcula.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create table market_settlement_entries (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid references rounds on delete cascade not null,
  market_id uuid references betting_markets on delete cascade not null,
  player_id uuid references profiles not null,
  chips_bet int not null default 0,
  chips_prize int not null default 0,
  is_winner boolean not null default false,
  created_at timestamptz default now(),
  unique (market_id, player_id)
);

alter table market_settlement_entries enable row level security;
create policy "Desglose de liquidación visible para autenticados" on market_settlement_entries for select to authenticated using (true);
create policy "Desglose de liquidación editable por autenticados" on market_settlement_entries for all to authenticated using (true);

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
  delete from market_settlement_entries where round_id = p_round_id;
  update round_settlements set voided_at = now() where round_id = p_round_id and voided_at is null;

  create temporary table tmp_round_net (
    player_id uuid primary key,
    net int not null default 0,
    bet int not null default 0,
    prize int not null default 0,
    correct int not null default 0,
    markets_bet int not null default 0
  ) on commit drop;

  create temporary table tmp_market_shares (
    player_id uuid,
    chips int,
    share int
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
      insert into market_settlement_entries (round_id, market_id, player_id, chips_bet, chips_prize, is_winner)
      select p_round_id, v_market.id, b.player_id, sum(b.chips), sum(b.chips), false
      from bets b where b.market_id = v_market.id group by b.player_id;
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

      insert into market_settlement_entries (round_id, market_id, player_id, chips_bet, chips_prize, is_winner)
      select p_round_id, v_market.id, b.player_id, sum(b.chips), 0, false
      from bets b where b.market_id = v_market.id group by b.player_id;

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

    -- Reparto por método del mayor resto: se calcula una sola vez en
    -- tmp_market_shares y se reutiliza tanto para el neto agregado de
    -- la jornada como para el desglose por pregunta.
    truncate tmp_market_shares;
    insert into tmp_market_shares
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
    select s.player_id, s.chips, (s.base_share + (case when s.rn <= (v_full_pot - tb.s) then 1 else 0 end))::int
    from shares s, total_base tb;

    update tmp_round_net t
    set net = t.net + (ms.share - ms.chips), prize = t.prize + ms.share, correct = t.correct + 1
    from tmp_market_shares ms where t.player_id = ms.player_id;

    insert into market_settlement_entries (round_id, market_id, player_id, chips_bet, chips_prize, is_winner)
    select p_round_id, v_market.id, player_id, chips, share, true from tmp_market_shares;

    -- Quien apostó a una opción distinta de la ganadora (y no ganó por
    -- ninguna otra vía en este mercado) pierde esa apuesta.
    insert into market_settlement_entries (round_id, market_id, player_id, chips_bet, chips_prize, is_winner)
    select p_round_id, v_market.id, b.player_id, sum(b.chips), 0, false
    from bets b
    where b.market_id = v_market.id
      and b.option_id <> v_market.winning_option_id
      and b.player_id not in (select player_id from tmp_market_shares)
    group by b.player_id;

    update tmp_round_net t set net = t.net - b.chips
      from bets b where b.market_id = v_market.id and b.option_id <> v_market.winning_option_id and b.player_id = t.player_id;
  end loop;

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
