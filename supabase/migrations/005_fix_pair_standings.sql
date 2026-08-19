-- ============================================================
-- Corrige pair_standings: antes solo mostraba parejas que ya habían
-- jugado juntas. Ahora muestra siempre las 6 combinaciones posibles
-- entre los jugadores registrados (con 0 si aún no han jugado juntos).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace view pair_standings as
with all_pairs as (
  select
    least(p1.id::text, p2.id::text) || '_' || greatest(p1.id::text, p2.id::text) as pair_key,
    p1.id as p1_id, p1.name as p1_name,
    p2.id as p2_id, p2.name as p2_name
  from profiles p1
  join profiles p2 on p1.id < p2.id
),
pair_matches as (
  select
    least(team1_p1_id::text, team1_p2_id::text) || '_' || greatest(team1_p1_id::text, team1_p2_id::text) as pair_key,
    case when winner = 'team1' then 2 when winner = 'draw' then 1 else 0 end as points,
    case when winner = 'team1' then 1 else 0 end as wins,
    case when winner = 'draw' then 1 else 0 end as draws,
    case when winner = 'team2' then 1 else 0 end as losses
  from matches where winner is not null
  union all
  select
    least(team2_p1_id::text, team2_p2_id::text) || '_' || greatest(team2_p1_id::text, team2_p2_id::text) as pair_key,
    case when winner = 'team2' then 2 when winner = 'draw' then 1 else 0 end as points,
    case when winner = 'team2' then 1 else 0 end as wins,
    case when winner = 'draw' then 1 else 0 end as draws,
    case when winner = 'team1' then 1 else 0 end as losses
  from matches where winner is not null
)
select
  ap.pair_key,
  ap.p1_id, ap.p1_name,
  ap.p2_id, ap.p2_name,
  coalesce(count(pm.pair_key), 0) as matches_played,
  coalesce(sum(pm.wins), 0) as wins,
  coalesce(sum(pm.draws), 0) as draws,
  coalesce(sum(pm.losses), 0) as losses,
  coalesce(sum(pm.points), 0) as points
from all_pairs ap
left join pair_matches pm on pm.pair_key = ap.pair_key
group by ap.pair_key, ap.p1_id, ap.p1_name, ap.p2_id, ap.p2_name
order by points desc, wins desc;
