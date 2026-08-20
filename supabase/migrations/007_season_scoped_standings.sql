-- ============================================================
-- Las clasificaciones no distinguían temporada: en cuanto exista una
-- 2ª temporada, sus puntos se sumarían para siempre con los de la 1ª.
-- Añadimos season_id a ambas vistas y las hacemos por temporada.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace view individual_standings as
with match_points as (
  select
    r.season_id,
    p.id as player_id,
    p.name,
    count(m.id) as matches_played,
    sum(case
      when (m.team1_p1_id = p.id or m.team1_p2_id = p.id) and m.winner = 'team1' then 2
      when (m.team2_p1_id = p.id or m.team2_p2_id = p.id) and m.winner = 'team2' then 2
      when m.winner = 'draw' then 1
      else 0
    end) as sport_points,
    sum(case
      when (m.team1_p1_id = p.id or m.team1_p2_id = p.id) and m.winner = 'team1' then 1
      when (m.team2_p1_id = p.id or m.team2_p2_id = p.id) and m.winner = 'team2' then 1
      else 0
    end) as wins,
    sum(case when m.winner = 'draw' then 1 else 0 end) as draws,
    sum(case
      when (m.team1_p1_id = p.id or m.team1_p2_id = p.id) and m.winner = 'team2' then 1
      when (m.team2_p1_id = p.id or m.team2_p2_id = p.id) and m.winner = 'team1' then 1
      else 0
    end) as losses
  from profiles p
  join matches m on (
    m.team1_p1_id = p.id or m.team1_p2_id = p.id or
    m.team2_p1_id = p.id or m.team2_p2_id = p.id
  )
  join rounds r on r.id = m.round_id
  where m.winner is not null
  group by r.season_id, p.id, p.name
),
betting_bonus as (
  select r.season_id, brr.player_id, coalesce(sum(brr.point_bonus), 0) as total_bonus
  from betting_round_results brr
  join rounds r on r.id = brr.round_id
  group by r.season_id, brr.player_id
)
select
  mp.season_id,
  mp.player_id,
  mp.name,
  mp.matches_played,
  mp.wins,
  mp.draws,
  mp.losses,
  mp.sport_points,
  coalesce(bb.total_bonus, 0) as betting_bonus,
  mp.sport_points + coalesce(bb.total_bonus, 0) as total_points
from match_points mp
left join betting_bonus bb on bb.player_id = mp.player_id and bb.season_id = mp.season_id
order by mp.season_id, total_points desc, mp.sport_points desc;

-- ------------------------------------------------------------

create or replace view pair_standings as
with all_pairs as (
  select
    s.id as season_id,
    least(p1.id::text, p2.id::text) || '_' || greatest(p1.id::text, p2.id::text) as pair_key,
    p1.id as p1_id, p1.name as p1_name,
    p2.id as p2_id, p2.name as p2_name
  from seasons s
  cross join profiles p1
  join profiles p2 on p1.id < p2.id
),
pair_matches as (
  select
    r.season_id,
    least(m.team1_p1_id::text, m.team1_p2_id::text) || '_' || greatest(m.team1_p1_id::text, m.team1_p2_id::text) as pair_key,
    case when m.winner = 'team1' then 2 when m.winner = 'draw' then 1 else 0 end as points,
    case when m.winner = 'team1' then 1 else 0 end as wins,
    case when m.winner = 'draw' then 1 else 0 end as draws,
    case when m.winner = 'team2' then 1 else 0 end as losses
  from matches m
  join rounds r on r.id = m.round_id
  where m.winner is not null
  union all
  select
    r.season_id,
    least(m.team2_p1_id::text, m.team2_p2_id::text) || '_' || greatest(m.team2_p1_id::text, m.team2_p2_id::text) as pair_key,
    case when m.winner = 'team2' then 2 when m.winner = 'draw' then 1 else 0 end as points,
    case when m.winner = 'team2' then 1 else 0 end as wins,
    case when m.winner = 'draw' then 1 else 0 end as draws,
    case when m.winner = 'team1' then 1 else 0 end as losses
  from matches m
  join rounds r on r.id = m.round_id
  where m.winner is not null
)
select
  ap.season_id,
  ap.pair_key,
  ap.p1_id, ap.p1_name,
  ap.p2_id, ap.p2_name,
  coalesce(count(pm.pair_key), 0) as matches_played,
  coalesce(sum(pm.wins), 0) as wins,
  coalesce(sum(pm.draws), 0) as draws,
  coalesce(sum(pm.losses), 0) as losses,
  coalesce(sum(pm.points), 0) as points
from all_pairs ap
left join pair_matches pm on pm.pair_key = ap.pair_key and pm.season_id = ap.season_id
group by ap.season_id, ap.pair_key, ap.p1_id, ap.p1_name, ap.p2_id, ap.p2_name
order by ap.season_id, points desc, wins desc;
