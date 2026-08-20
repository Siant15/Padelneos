-- ============================================================
-- individual_standings solo mostraba jugadores con al menos un
-- partido jugado (join directo con matches), así que una temporada
-- recién creada aparecía sin ningún participante en Clasificación en
-- vez de mostrar a los 4 con 0 puntos. pair_standings ya hacía esto
-- bien (cross join de todas las parejas posibles); aplicamos el mismo
-- patrón aquí.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

drop view if exists individual_standings;

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
