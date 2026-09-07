-- ============================================================
-- Revierte la 054: victoria vuelve a valer 2 puntos (empate 1,
-- derrota 0) — el usuario decidió no tocarlo después de todo.
-- ============================================================

drop view if exists individual_standings;
drop view if exists pair_standings;

create or replace view individual_standings as
with all_players as (
  select s.id as season_id, p.id as player_id, p.name
  from seasons s
  cross join profiles p
),
match_points as (
  select
    r.season_id,
    p.id as player_id,
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
  group by r.season_id, p.id
),
betting_bonus as (
  select r.season_id, brr.player_id, coalesce(sum(brr.point_bonus), 0) as total_bonus
  from betting_round_results brr
  join rounds r on r.id = brr.round_id
  group by r.season_id, brr.player_id
)
select
  ap.season_id,
  ap.player_id,
  ap.name,
  coalesce(mp.matches_played, 0) as matches_played,
  coalesce(mp.wins, 0) as wins,
  coalesce(mp.draws, 0) as draws,
  coalesce(mp.losses, 0) as losses,
  coalesce(mp.sport_points, 0) as sport_points,
  coalesce(bb.total_bonus, 0) as betting_bonus,
  coalesce(mp.sport_points, 0) + coalesce(bb.total_bonus, 0) as total_points
from all_players ap
left join match_points mp on mp.player_id = ap.player_id and mp.season_id = ap.season_id
left join betting_bonus bb on bb.player_id = ap.player_id and bb.season_id = ap.season_id
order by ap.season_id, total_points desc, sport_points desc;

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
