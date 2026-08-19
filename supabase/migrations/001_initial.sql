-- ============================================================
-- LIGA PÁDEL — Schema inicial
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Extensión para UUIDs
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extiende auth.users)
-- ============================================================
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Profiles visibles para todos los autenticados"
  on profiles for select
  to authenticated
  using (true);

create policy "Cada usuario edita su propio perfil"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- Auto-crear perfil al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- SEASONS (temporadas / ligas)
-- ============================================================
create table seasons (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  start_date date not null,
  end_date date,
  day_of_week int check (day_of_week between 0 and 6), -- 0=Dom, 1=Lun...
  match_time time,
  min_matches int default 9,
  status text default 'active' check (status in ('active', 'finished')),
  created_at timestamptz default now()
);

alter table seasons enable row level security;
create policy "Seasons visibles para autenticados" on seasons for select to authenticated using (true);
create policy "Seasons editables por autenticados" on seasons for all to authenticated using (true);

-- ============================================================
-- ROUNDS (jornadas)
-- ============================================================
create table rounds (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid references seasons on delete cascade not null,
  round_number int not null,
  scheduled_date date not null,
  status text default 'scheduled' check (status in ('scheduled', 'played', 'cancelled')),
  court_booker_id uuid references profiles,
  court_confirmed boolean default false,
  created_at timestamptz default now(),
  unique(season_id, round_number)
);

alter table rounds enable row level security;
create policy "Rounds visibles para autenticados" on rounds for select to authenticated using (true);
create policy "Rounds editables por autenticados" on rounds for all to authenticated using (true);

-- ============================================================
-- MATCHES (partido de cada jornada: 2v2)
-- ============================================================
create table matches (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid references rounds on delete cascade unique not null,
  -- Equipo 1
  team1_p1_id uuid references profiles not null,
  team1_p2_id uuid references profiles not null,
  -- Equipo 2
  team2_p1_id uuid references profiles not null,
  team2_p2_id uuid references profiles not null,
  -- Sets (máximo 3)
  set1_t1 int check (set1_t1 between 0 and 7),
  set1_t2 int check (set1_t2 between 0 and 7),
  set2_t1 int check (set2_t1 between 0 and 7),
  set2_t2 int check (set2_t2 between 0 and 7),
  set3_t1 int check (set3_t1 between 0 and 7),
  set3_t2 int check (set3_t2 between 0 and 7),
  -- Resultado calculado
  winner text check (winner in ('team1', 'team2', 'draw')),
  played_at timestamptz,
  created_at timestamptz default now()
);

alter table matches enable row level security;
create policy "Matches visibles para autenticados" on matches for select to authenticated using (true);
create policy "Matches editables por autenticados" on matches for all to authenticated using (true);

-- ============================================================
-- MATCH STATS (estadísticas individuales por partido)
-- ============================================================
create table match_stats (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid references matches on delete cascade not null,
  player_id uuid references profiles not null,
  aces int default 0 check (aces >= 0),
  double_faults int default 0 check (double_faults >= 0),
  bolas_por_3 int default 0 check (bolas_por_3 >= 0),
  smash_al_cristal int default 0 check (smash_al_cristal >= 0),
  created_at timestamptz default now(),
  unique(match_id, player_id)
);

alter table match_stats enable row level security;
create policy "Stats visibles para autenticados" on match_stats for select to authenticated using (true);
create policy "Stats editables por autenticados" on match_stats for all to authenticated using (true);

-- ============================================================
-- BETTING MARKETS (mercados de predicción por jornada)
-- ============================================================
create table betting_markets (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid references rounds on delete cascade not null,
  type text not null check (type in ('yes_no', 'player_choice', 'quantity')),
  description text not null,
  -- Para mercados de cantidad: valor mínimo esperado
  quantity_threshold int,
  -- Solo jugadores pueden apostar a su propio beneficio
  -- La restricción "no apostar contra uno mismo" se valida en app
  closes_at timestamptz,
  resolved boolean default false,
  winning_option_id uuid, -- se rellena al resolver
  created_at timestamptz default now()
);

alter table betting_markets enable row level security;
create policy "Markets visibles para autenticados" on betting_markets for select to authenticated using (true);
create policy "Markets editables por autenticados" on betting_markets for all to authenticated using (true);

-- ============================================================
-- BETTING OPTIONS (opciones dentro de cada mercado)
-- ============================================================
create table betting_options (
  id uuid primary key default uuid_generate_v4(),
  market_id uuid references betting_markets on delete cascade not null,
  label text not null,
  -- Para mercados player_choice: qué jugador representa
  player_id uuid references profiles,
  -- Para yes_no: true/false; para quantity: el valor objetivo
  value text,
  created_at timestamptz default now()
);

alter table betting_options enable row level security;
create policy "Options visibles para autenticados" on betting_options for select to authenticated using (true);
create policy "Options editables por autenticados" on betting_options for all to authenticated using (true);

-- FK diferida para winning_option_id (evita circular dependency)
alter table betting_markets
  add constraint fk_winning_option
  foreign key (winning_option_id) references betting_options(id);

-- ============================================================
-- BETS (apuestas de cada jugador)
-- ============================================================
create table bets (
  id uuid primary key default uuid_generate_v4(),
  market_id uuid references betting_markets on delete cascade not null,
  option_id uuid references betting_options not null,
  player_id uuid references profiles not null,
  chips int not null check (chips > 0),
  created_at timestamptz default now(),
  -- Un jugador puede apostar a varias opciones del mismo mercado (distribuyendo fichas)
  unique(market_id, option_id, player_id)
);

alter table bets enable row level security;
-- Cada jugador ve todas las apuestas (para el mercado pari-mutuel)
-- pero solo puede crear/modificar las suyas
create policy "Bets visibles para autenticados" on bets for select to authenticated using (true);
create policy "Bets: crear propias" on bets for insert to authenticated with check (auth.uid() = player_id);
create policy "Bets: editar propias" on bets for update to authenticated using (auth.uid() = player_id);
create policy "Bets: borrar propias antes del cierre" on bets for delete to authenticated using (auth.uid() = player_id);

-- ============================================================
-- BETTING ROUND RESULTS (resultado de apuestas por jornada)
-- ============================================================
create table betting_round_results (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid references rounds on delete cascade not null,
  player_id uuid references profiles not null,
  chips_net int default 0,       -- fichas ganadas/perdidas en la jornada
  chips_total int default 0,     -- fichas acumuladas en toda la liga
  point_bonus numeric(4,2) default 0, -- 0, 0.5 o 1 punto
  rank int check (rank between 1 and 4),
  created_at timestamptz default now(),
  unique(round_id, player_id)
);

alter table betting_round_results enable row level security;
create policy "Betting results visibles para autenticados" on betting_round_results for select to authenticated using (true);
create policy "Betting results editables por autenticados" on betting_round_results for all to authenticated using (true);

-- ============================================================
-- VIEWS útiles
-- ============================================================

-- Clasificación individual (puntos deportivos + bonus apuestas)
create or replace view individual_standings as
with match_points as (
  select
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
  left join matches m on (
    m.team1_p1_id = p.id or m.team1_p2_id = p.id or
    m.team2_p1_id = p.id or m.team2_p2_id = p.id
  )
  where m.winner is not null
  group by p.id, p.name
),
betting_bonus as (
  select player_id, coalesce(sum(point_bonus), 0) as total_bonus
  from betting_round_results
  group by player_id
)
select
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
left join betting_bonus bb on bb.player_id = mp.player_id
order by total_points desc, sport_points desc;

-- Clasificación de parejas
create or replace view pair_standings as
with pair_matches as (
  -- Todas las combinaciones de pareja con su resultado
  select
    least(team1_p1_id::text, team1_p2_id::text) || '_' || greatest(team1_p1_id::text, team1_p2_id::text) as pair_key,
    team1_p1_id as p1_id,
    team1_p2_id as p2_id,
    case when winner = 'team1' then 2 when winner = 'draw' then 1 else 0 end as points,
    case when winner = 'team1' then 1 else 0 end as wins,
    case when winner = 'draw' then 1 else 0 end as draws,
    case when winner = 'team2' then 1 else 0 end as losses
  from matches where winner is not null
  union all
  select
    least(team2_p1_id::text, team2_p2_id::text) || '_' || greatest(team2_p1_id::text, team2_p2_id::text) as pair_key,
    team2_p1_id as p1_id,
    team2_p2_id as p2_id,
    case when winner = 'team2' then 2 when winner = 'draw' then 1 else 0 end as points,
    case when winner = 'team2' then 1 else 0 end as wins,
    case when winner = 'draw' then 1 else 0 end as draws,
    case when winner = 'team1' then 1 else 0 end as losses
  from matches where winner is not null
)
select
  pm.pair_key,
  pm.p1_id,
  p1.name as p1_name,
  pm.p2_id,
  p2.name as p2_name,
  count(*) as matches_played,
  sum(pm.wins) as wins,
  sum(pm.draws) as draws,
  sum(pm.losses) as losses,
  sum(pm.points) as points
from pair_matches pm
join profiles p1 on p1.id = pm.p1_id
join profiles p2 on p2.id = pm.p2_id
group by pm.pair_key, pm.p1_id, p1.name, pm.p2_id, p2.name
order by points desc, wins desc;
