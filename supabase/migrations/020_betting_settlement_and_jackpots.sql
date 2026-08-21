-- ============================================================
-- Motor de resolución y liquidación de apuestas: jackpots por
-- plantilla+temporada, resolución automática de preguntas "automatic"
-- desde el resultado del partido, y liquidación atómica/idempotente
-- de la jornada (reparto proporcional + puntos de ranking).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create table jackpots (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references betting_question_templates not null,
  season_id uuid references seasons not null,
  chips int not null default 0 check (chips >= 0),
  updated_at timestamptz default now(),
  unique (template_id, season_id)
);

alter table jackpots enable row level security;
create policy "Jackpots visibles para autenticados" on jackpots for select to authenticated using (true);
create policy "Jackpots editables por autenticados" on jackpots for all to authenticated using (true);

-- Registro de a quién pertenece cada ficha de cada jackpot: entra
-- ('in','rollover') cuando una pregunta se resuelve sin nadie que
-- acierte; sale consumida por un premio ('out','payout_consumption')
-- o devuelta al cerrar la liga ('out','season_refund'). round_id es
-- null solo para season_refund (no está atado a una jornada concreta).
create table jackpot_contributions (
  id uuid primary key default uuid_generate_v4(),
  jackpot_id uuid references jackpots on delete cascade not null,
  round_id uuid references rounds,
  player_id uuid references profiles,
  chips int not null check (chips > 0),
  direction text not null check (direction in ('in', 'out')),
  reason text not null check (reason in ('rollover', 'payout_consumption', 'season_refund')),
  created_at timestamptz default now()
);

alter table jackpot_contributions enable row level security;
create policy "Contribuciones visibles para autenticados" on jackpot_contributions for select to authenticated using (true);
create policy "Contribuciones editables por autenticados" on jackpot_contributions for all to authenticated using (true);

-- ------------------------------------------------------------
-- Resuelve solas las preguntas "automatic" de una jornada a partir
-- del resultado del partido. Se llama justo después de guardar el
-- resultado (ver app/(app)/admin/jornadas/[id]/resultado/page.tsx).
-- Si no hay resultado todavía, no hace nada (se puede llamar varias
-- veces sin problema). Puede dejar winning_option_id en null cuando
-- la respuesta correcta no coincide con ninguna opción existente
-- (p. ej. nadie pronosticó ese marcador exacto) — no es un error, esa
-- pregunta queda "resuelta sin ganador" igual que cualquier otra.
-- ------------------------------------------------------------
create or replace function auto_resolve_round_markets(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_match record;
  v_market record;
  v_option_id uuid;
  v_set1_winner text;
  v_set2_winner text;
  v_set3_winner text;
  v_decided_in_two boolean;
  v_has_tiebreak boolean;
  v_has_comeback boolean;
  v_score_value text;
begin
  select * into v_match from matches where round_id = p_round_id;
  if v_match is null or v_match.winner is null then
    return;
  end if;

  v_set1_winner := case when v_match.set1_t1 > v_match.set1_t2 then 'team1' else 'team2' end;
  v_set2_winner := case when v_match.set2_t1 > v_match.set2_t2 then 'team1' else 'team2' end;
  v_decided_in_two := v_set1_winner = v_set2_winner;
  v_set3_winner := case
    when v_match.set3_t1 is null then null
    when v_match.set3_t1 > v_match.set3_t2 then 'team1'
    else 'team2'
  end;
  v_has_tiebreak :=
    (greatest(v_match.set1_t1, v_match.set1_t2) = 7 and least(v_match.set1_t1, v_match.set1_t2) = 6)
    or (greatest(v_match.set2_t1, v_match.set2_t2) = 7 and least(v_match.set2_t1, v_match.set2_t2) = 6)
    or (v_match.set3_t1 is not null and greatest(v_match.set3_t1, v_match.set3_t2) = 7 and least(v_match.set3_t1, v_match.set3_t2) = 6);
  v_has_comeback := not v_decided_in_two and v_set1_winner <> v_match.winner;

  for v_market in
    select bm.*, t.resolution_key
    from betting_markets bm
    join betting_question_templates t on t.id = bm.template_id
    where bm.round_id = p_round_id and not bm.resolved and t.category = 'automatic'
  loop
    v_option_id := null;

    if v_market.resolution_key = 'match_winner' then
      select id into v_option_id from betting_options where market_id = v_market.id and value = v_match.winner;

    elsif v_market.resolution_key = 'set1_winner' then
      select id into v_option_id from betting_options where market_id = v_market.id and value = v_set1_winner;

    elsif v_market.resolution_key = 'set2_winner' then
      select id into v_option_id from betting_options where market_id = v_market.id and value = v_set2_winner;

    elsif v_market.resolution_key = 'set3_winner' then
      if v_set3_winner is null then
        select id into v_option_id from betting_options where market_id = v_market.id and is_none;
      else
        select id into v_option_id from betting_options where market_id = v_market.id and value = v_set3_winner;
      end if;

    elsif v_market.resolution_key = 'third_set' then
      select id into v_option_id from betting_options where market_id = v_market.id
        and value = (case when v_set3_winner is not null then 'yes' else 'no' end);

    elsif v_market.resolution_key = 'tiebreak' then
      select id into v_option_id from betting_options where market_id = v_market.id
        and value = (case when v_has_tiebreak then 'yes' else 'no' end);

    elsif v_market.resolution_key = 'comeback' then
      select id into v_option_id from betting_options where market_id = v_market.id
        and value = (case when v_has_comeback then 'yes' else 'no' end);

    elsif v_market.resolution_key = 'sets_score' then
      v_score_value := v_match.winner || '_2_' || (case when v_decided_in_two then '0' else '1' end);
      select id into v_option_id from betting_options where market_id = v_market.id and value = v_score_value;

    elsif v_market.resolution_key = 'exact_score' then
      v_score_value := v_match.set1_t1 || '-' || v_match.set1_t2 || ',' || v_match.set2_t1 || '-' || v_match.set2_t2
        || (case when v_set3_winner is not null then ',' || v_match.set3_t1 || '-' || v_match.set3_t2 else '' end);
      select id into v_option_id from betting_options where market_id = v_market.id and value = v_score_value;
    end if;

    update betting_markets set resolved = true, winning_option_id = v_option_id where id = v_market.id;
  end loop;
end;
$$;

grant execute on function auto_resolve_round_markets(uuid) to authenticated;

-- ------------------------------------------------------------
-- Liquida una jornada: exige que todas sus preguntas estén resueltas
-- o anuladas, reparte cada bote (más el jackpot acumulado de su
-- plantilla/temporada si lo consume), acumula fichas finales por
-- jugador, asigna puesto y puntos con desempates, y lo deja todo en
-- betting_round_results. Atómica (una función = una transacción) e
-- idempotente: si ya existía una liquidación, la deshace por completo
-- (incluida cualquier ficha de jackpot que hubiera movido) antes de
-- volver a calcular, así corregir un resultado y repetir la llamada
-- da siempre el estado correcto, nunca paga dos veces.
-- ------------------------------------------------------------
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

  -- Deshacer una liquidación previa (correción de resultado) antes de recalcular.
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
    delete from betting_round_results where round_id = p_round_id;
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

    -- Todo el que apostó en este mercado cuenta como "apostado" y
    -- "pregunta jugada", gane, pierda, se anule o vaya a jackpot.
    update tmp_round_net t set bet = t.bet + b.chips, markets_bet = t.markets_bet + 1
      from bets b where b.market_id = v_market.id and b.player_id = t.player_id;

    if v_market.voided then
      continue; -- se devuelven las fichas: no se toca `net`, no genera jackpot
    end if;

    if v_market.winning_option_id is not null then
      select coalesce(sum(chips), 0) into v_winner_total from bets where market_id = v_market.id and option_id = v_market.winning_option_id;
    else
      v_winner_total := 0;
    end if;

    if v_winner_total = 0 then
      -- Nadie acertó (o nadie apostó a la opción correcta): el bote
      -- entero pasa a ser jackpot de esta plantilla+temporada.
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

    -- Hay ganadores: se reparte el bote + el jackpot acumulado (si lo hay).
    select * into v_jackpot from jackpots where template_id = v_market.template_id and season_id = v_season_id;
    v_jackpot_bonus := coalesce(v_jackpot.chips, 0);
    v_full_pot := v_total_pot + v_jackpot_bonus;

    if v_jackpot_bonus > 0 then
      insert into jackpot_contributions (jackpot_id, round_id, player_id, chips, direction, reason)
      values (v_jackpot.id, p_round_id, null, v_jackpot_bonus, 'out', 'payout_consumption');
      update jackpots set chips = 0, updated_at = now() where id = v_jackpot.id;
    end if;

    -- Reparto por método del mayor resto: parte entera para todos,
    -- y las fichas que sobran por redondeo a quienes tengan mayor resto.
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

    -- Quien apostó a una opción distinta de la ganadora, en este
    -- mismo mercado, pierde esa apuesta.
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
  from grouped g join grp_bonus gb on gb.grp = g.grp;

  insert into round_settlements (round_id, version)
  values (p_round_id, coalesce(v_prev.version, 0) + 1);
end;
$$;

grant execute on function settle_round(uuid) to authenticated;

-- ------------------------------------------------------------
-- Al cerrar una temporada, cualquier jackpot pendiente de sus
-- plantillas se devuelve proporcionalmente a quienes contribuyeron a
-- generarlo (nunca se traslada a la liga siguiente). Se llama desde
-- start_new_season, redefinida más abajo.
-- ------------------------------------------------------------
create or replace function close_season_jackpots(p_season_id uuid)
returns void
language plpgsql
as $$
declare
  v_jackpot record;
begin
  for v_jackpot in select * from jackpots where season_id = p_season_id and chips > 0 loop
    with contributions as (
      select player_id, sum(chips) as total_in
      from jackpot_contributions
      where jackpot_id = v_jackpot.id and direction = 'in'
      group by player_id
    ),
    total as (select sum(total_in) as grand_total from contributions),
    shares as (
      select c.player_id, c.total_in,
             (c.total_in::numeric / t.grand_total) * v_jackpot.chips as raw_share
      from contributions c, total t
    ),
    based as (
      select *, floor(raw_share) as base_share, raw_share - floor(raw_share) as remainder,
             row_number() over (order by raw_share - floor(raw_share) desc, player_id) as rn
      from shares
    ),
    total_base as (select coalesce(sum(base_share), 0) as s from based)
    insert into jackpot_contributions (jackpot_id, round_id, player_id, chips, direction, reason)
    select v_jackpot.id, null, b.player_id,
           b.base_share + (case when b.rn <= (v_jackpot.chips - tb.s) then 1 else 0 end),
           'out', 'season_refund'
    from based b, total_base tb
    where b.base_share + (case when b.rn <= (v_jackpot.chips - tb.s) then 1 else 0 end) > 0;

    update jackpots set chips = 0, updated_at = now() where id = v_jackpot.id;
  end loop;
end;
$$;

grant execute on function close_season_jackpots(uuid) to authenticated;

-- Redefine start_new_season (017_calendar_management.sql) para
-- liquidar los jackpots pendientes de la temporada saliente antes de
-- archivarla.
create or replace function start_new_season(p_name text, p_min_matches int)
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
  return v_new_id;
end;
$$;

-- ------------------------------------------------------------
-- Ranking acumulado de apuestas por temporada (punto 20).
-- ------------------------------------------------------------
create or replace view betting_leaderboard as
select
  r.season_id,
  brr.player_id,
  p.name,
  sum(brr.point_bonus) as points,
  count(*) filter (where brr.rank = 1) as firsts,
  count(*) filter (where brr.rank = 2) as seconds,
  sum(brr.correct_count) as correct_picks,
  sum(brr.markets_bet_count) as markets_bet,
  case when sum(brr.markets_bet_count) > 0
    then round(100.0 * sum(brr.correct_count) / sum(brr.markets_bet_count), 1)
    else 0
  end as accuracy_pct,
  sum(brr.chips_bet) as total_bet,
  sum(brr.chips_won) as total_prizes,
  max(brr.chips_final) as best_round_chips,
  max(brr.chips_won) as biggest_single_prize,
  (
    select count(distinct jc.round_id)
    from jackpot_contributions jc
    join jackpots j on j.id = jc.jackpot_id
    join betting_markets bm on bm.round_id = jc.round_id and bm.template_id = j.template_id
    join bets b on b.market_id = bm.id and b.option_id = bm.winning_option_id and b.player_id = brr.player_id
    where jc.reason = 'payout_consumption' and j.season_id = r.season_id
  ) as jackpots_won
from betting_round_results brr
join rounds r on r.id = brr.round_id
join profiles p on p.id = brr.player_id
group by r.season_id, brr.player_id, p.name;
