-- ============================================================
-- Plantillas de preguntas de apuestas reutilizables. Hasta ahora cada
-- pregunta se creaba suelta por jornada (sin ningún concepto de
-- plantilla). A partir de aquí:
--   - Las preguntas "obligatorias" (ganador, resultado por sets,
--     marcador exacto, y las 5 "primer jugador que...") se instancian
--     solas en cada jornada nueva (auto_apply = true).
--   - El resto del catálogo vive desactivado por defecto para poder
--     añadirse desde "Añadir más" sin saturar la interfaz.
--   - Cada jornada guarda una copia inmutable del texto/opciones
--     usados (betting_markets.description / betting_options.label ya
--     cumplían esto; ahora simplemente nacen copiados de la plantilla
--     en vez de escritos a mano cada vez).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create table betting_question_templates (
  id uuid primary key default uuid_generate_v4(),
  text text not null,
  category text not null check (category in ('automatic', 'anecdotal')),
  answer_type text not null check (answer_type in ('pair', 'player', 'yes_no', 'sets_score', 'exact_score', 'custom_options')),
  -- Solo relevante para category = 'automatic': qué dato del partido
  -- resuelve esta plantilla (ver 020_betting_settlement_and_jackpots.sql
  -- → auto_resolve_round_markets). Null para plantillas anecdóticas,
  -- que las resuelve un jugador a mano desde Mercados/Acta.
  resolution_key text check (resolution_key in ('match_winner', 'set1_winner', 'set2_winner', 'set3_winner', 'third_set', 'tiebreak', 'comeback', 'sets_score', 'exact_score')),
  options jsonb, -- solo para answer_type = 'custom_options': [{label, value}, ...]
  allow_none boolean not null default false,
  auto_apply boolean not null default false,
  active boolean not null default true,
  created_at timestamptz default now(),
  created_by uuid references profiles
);

alter table betting_question_templates enable row level security;
create policy "Plantillas visibles para autenticados" on betting_question_templates for select to authenticated using (true);
create policy "Plantillas editables por autenticados" on betting_question_templates for all to authenticated using (true);

-- ------------------------------------------------------------
-- Las 8 preguntas obligatorias del punto 10: se aplican solas a toda
-- jornada nueva.
-- ------------------------------------------------------------
insert into betting_question_templates (text, category, answer_type, resolution_key, allow_none, auto_apply) values
  ('Ganador del partido', 'automatic', 'pair', 'match_winner', false, true),
  ('Resultado por sets', 'automatic', 'sets_score', 'sets_score', false, true),
  ('Marcador exacto', 'automatic', 'exact_score', 'exact_score', false, true),
  ('Primer jugador en llegar tarde', 'anecdotal', 'player', null, true, true),
  ('Primer jugador que comete doble falta', 'anecdotal', 'player', null, true, true),
  ('Primer jugador que hace un ace', 'anecdotal', 'player', null, true, true),
  ('Primer jugador que hace un x3', 'anecdotal', 'player', null, true, true),
  ('Primer jugador que hace un smash al cristal', 'anecdotal', 'player', null, true, true);

-- ------------------------------------------------------------
-- Catálogo adicional del punto 11: existen y se pueden activar por
-- jornada desde "Añadir más", pero no se instancian solas.
-- ------------------------------------------------------------
insert into betting_question_templates (text, category, answer_type, resolution_key, allow_none, auto_apply) values
  ('Ganador del primer set', 'automatic', 'pair', 'set1_winner', false, false),
  ('Ganador del segundo set', 'automatic', 'pair', 'set2_winner', false, false),
  ('Ganador del tercer set', 'automatic', 'pair', 'set3_winner', true, false),
  ('¿Habrá tercer set?', 'automatic', 'yes_no', 'third_set', false, false),
  ('¿Habrá tie-break?', 'automatic', 'yes_no', 'tiebreak', false, false),
  ('¿Habrá remontada?', 'automatic', 'yes_no', 'comeback', false, false),
  ('Pareja que gana el primer punto de oro', 'anecdotal', 'pair', null, false, false),
  ('Primer jugador en enviar una bola fuera', 'anecdotal', 'player', null, true, false),
  ('Primer jugador en mandar un remate a la red', 'anecdotal', 'player', null, true, false),
  ('Primer jugador en recibir un pelotazo', 'anecdotal', 'player', null, true, false),
  ('Primero en pedir que se repita un punto', 'anecdotal', 'player', null, true, false),
  ('Primero en decir "mía" y perder el punto', 'anecdotal', 'player', null, true, false),
  ('Primero en poner una excusa', 'anecdotal', 'player', null, true, false),
  ('MVP', 'anecdotal', 'player', null, false, false),
  ('Mueble del partido', 'anecdotal', 'player', null, false, false),
  ('Duración del partido por intervalos', 'anecdotal', 'custom_options', null, false, false);

update betting_question_templates
  set options = '[{"label":"Menos de 45 min","value":"lt45"},{"label":"45-60 min","value":"45_60"},{"label":"60-75 min","value":"60_75"},{"label":"Más de 75 min","value":"gt75"}]'::jsonb
  where text = 'Duración del partido por intervalos';

-- ------------------------------------------------------------
-- betting_markets / betting_options: columnas nuevas para vincular
-- cada pregunta instanciada a su plantilla y a su temporada (el
-- jackpot se guarda por temporada+plantilla, ver 020), y para poder
-- anular una pregunta sin ganador (voided) o marcar una opción como
-- "Ninguno / no ocurrió" (is_none).
-- ------------------------------------------------------------
alter table betting_markets add column if not exists template_id uuid references betting_question_templates;
alter table betting_markets add column if not exists season_id uuid references seasons;
alter table betting_markets add column if not exists voided boolean not null default false;
alter table betting_options add column if not exists is_none boolean not null default false;

-- El tipo de mercado amplía sus valores válidos para los nuevos
-- answer_type de plantilla (se mantienen los tres antiguos por
-- compatibilidad con jornadas ya jugadas). Buscamos el nombre real
-- del check constraint en vez de asumirlo, por si Postgres lo llamó
-- de forma distinta a la convención por defecto.
do $$
declare
  v_constraint_name text;
begin
  -- Buscamos el check constraint por la COLUMNA que restringe (no por
  -- el texto de la definición: Postgres reescribe "type in (...)" como
  -- "type = ANY (ARRAY[...])" al guardarlo, así que buscar el texto
  -- "in" en la definición no lo encuentra).
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = con.conkey[1]
  where rel.relname = 'betting_markets'
    and con.contype = 'c'
    and array_length(con.conkey, 1) = 1
    and att.attname = 'type';

  if v_constraint_name is not null then
    execute format('alter table betting_markets drop constraint %I', v_constraint_name);
  end if;

  alter table betting_markets add constraint betting_markets_type_check
    check (type in ('yes_no', 'player_choice', 'quantity', 'pair', 'player', 'sets_score', 'exact_score', 'custom_options'));
end;
$$;

-- season_id nunca lo escribe la app a mano: se rellena solo desde la
-- jornada, así no puede quedar desincronizado.
create or replace function set_betting_market_season_id()
returns trigger as $$
begin
  new.season_id := (select season_id from rounds where id = new.round_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_betting_market_season_id on betting_markets;
create trigger trg_set_betting_market_season_id
  before insert on betting_markets
  for each row execute function set_betting_market_season_id();

-- Backfill de las preguntas ya existentes (creadas antes de esta
-- migración, sin plantilla asociada).
update betting_markets set season_id = rounds.season_id
  from rounds where rounds.id = betting_markets.round_id and betting_markets.season_id is null;

-- ------------------------------------------------------------
-- Instancia en una jornada las preguntas de las plantillas indicadas
-- (o todas las auto_apply si no se especifica ninguna). Idempotente:
-- si la jornada ya tiene una pregunta de esa plantilla, la omite en
-- vez de duplicarla. No hace nada si la jornada todavía no tiene
-- partido/parejas asignadas (no hay jugadores sobre los que generar
-- las opciones).
-- ------------------------------------------------------------
create or replace function instantiate_round_questions(p_round_id uuid, p_template_ids uuid[] default null)
returns void
language plpgsql
as $$
declare
  v_match record;
  v_tpl record;
  v_market_id uuid;
  v_pair_a_label text;
  v_pair_b_label text;
begin
  select
    m.team1_p1_id, m.team1_p2_id, m.team2_p1_id, m.team2_p2_id,
    p1.name as p1_name, p2.name as p2_name, p3.name as p3_name, p4.name as p4_name
  into v_match
  from matches m
  join profiles p1 on p1.id = m.team1_p1_id
  join profiles p2 on p2.id = m.team1_p2_id
  join profiles p3 on p3.id = m.team2_p1_id
  join profiles p4 on p4.id = m.team2_p2_id
  where m.round_id = p_round_id;

  if v_match is null then
    return;
  end if;

  v_pair_a_label := v_match.p1_name || ' / ' || v_match.p2_name;
  v_pair_b_label := v_match.p3_name || ' / ' || v_match.p4_name;

  for v_tpl in
    select * from betting_question_templates
    where active
      and (
        (p_template_ids is null and auto_apply)
        or (p_template_ids is not null and id = any (p_template_ids))
      )
  loop
    if exists (select 1 from betting_markets where round_id = p_round_id and template_id = v_tpl.id) then
      continue;
    end if;

    insert into betting_markets (round_id, type, description, template_id)
    values (p_round_id, v_tpl.answer_type, v_tpl.text, v_tpl.id)
    returning id into v_market_id;

    if v_tpl.answer_type = 'pair' then
      insert into betting_options (market_id, label, value) values
        (v_market_id, v_pair_a_label, 'team1'),
        (v_market_id, v_pair_b_label, 'team2');
      if v_tpl.allow_none then
        insert into betting_options (market_id, label, value, is_none) values (v_market_id, 'No hubo tercer set', 'none', true);
      end if;

    elsif v_tpl.answer_type = 'yes_no' then
      insert into betting_options (market_id, label, value) values
        (v_market_id, 'Sí', 'yes'),
        (v_market_id, 'No', 'no');

    elsif v_tpl.answer_type = 'sets_score' then
      insert into betting_options (market_id, label, value) values
        (v_market_id, v_pair_a_label || ' gana 2-0', 'team1_2_0'),
        (v_market_id, v_pair_a_label || ' gana 2-1', 'team1_2_1'),
        (v_market_id, v_pair_b_label || ' gana 2-0', 'team2_2_0'),
        (v_market_id, v_pair_b_label || ' gana 2-1', 'team2_2_1');

    elsif v_tpl.answer_type = 'player' then
      insert into betting_options (market_id, label, player_id, is_self_negative) values
        (v_market_id, v_match.p1_name, v_match.team1_p1_id, true),
        (v_market_id, v_match.p2_name, v_match.team1_p2_id, true),
        (v_market_id, v_match.p3_name, v_match.team2_p1_id, true),
        (v_market_id, v_match.p4_name, v_match.team2_p2_id, true);
      if v_tpl.allow_none then
        insert into betting_options (market_id, label, value, is_none) values (v_market_id, 'Ninguno', 'none', true);
      end if;

    elsif v_tpl.answer_type = 'custom_options' then
      insert into betting_options (market_id, label, value)
      select opt ->> 'label', opt ->> 'value'
      from jsonb_array_elements(coalesce(v_tpl.options, '[]'::jsonb)) opt;
      if v_tpl.allow_none then
        insert into betting_options (market_id, label, value, is_none) values (v_market_id, 'Ninguno', 'none', true);
      end if;

    -- exact_score: sin opciones iniciales; se crean bajo demanda al
    -- apostar (ver instantiate_exact_score_option en esta misma migración).
    end if;
  end loop;
end;
$$;

-- Busca (o crea) la opción de "marcador exacto" para un valor
-- canónico como '6-4,3-6,6-3' — así dos jugadores que pronostican el
-- mismo resultado comparten bote en la misma opción.
create or replace function instantiate_exact_score_option(p_market_id uuid, p_value text, p_label text)
returns uuid
language plpgsql
as $$
declare
  v_option_id uuid;
begin
  select id into v_option_id from betting_options where market_id = p_market_id and value = p_value;
  if v_option_id is not null then
    return v_option_id;
  end if;
  insert into betting_options (market_id, label, value)
  values (p_market_id, p_label, p_value)
  returning id into v_option_id;
  return v_option_id;
end;
$$;

grant execute on function instantiate_round_questions(uuid, uuid[]) to authenticated;
grant execute on function instantiate_exact_score_option(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- Al crear o ampliar una liga, cada jornada nueva recibe ya las
-- preguntas de las plantillas auto_apply (sustituye la definición de
-- 017_calendar_management.sql, mismo nombre y firma — extend/start
-- siguen llamándola sin cambios).
-- ------------------------------------------------------------
create or replace function generate_season_rounds(p_season_id uuid, p_from_number int, p_to_number int)
returns void
language plpgsql
as $$
declare
  v_players uuid[];
  v_n int;
  v_pairing int;
  v_booker uuid;
  v_team1_p1 uuid;
  v_team1_p2 uuid;
  v_team2_p1 uuid;
  v_team2_p2 uuid;
  v_round_id uuid;
begin
  if not exists (select 1 from seasons where id = p_season_id) then
    raise exception 'Temporada no encontrada';
  end if;

  select array_agg(id order by created_at) into v_players from profiles;
  if v_players is null or array_length(v_players, 1) is distinct from 4 then
    raise exception 'Se necesitan exactamente 4 jugadores registrados (hay %)', coalesce(array_length(v_players, 1), 0);
  end if;

  for v_n in p_from_number..p_to_number loop
    v_pairing := (v_n - 1) % 3;
    v_booker := v_players[((v_n - 1) % 4) + 1];

    if v_pairing = 0 then
      v_team1_p1 := v_players[1]; v_team1_p2 := v_players[2]; v_team2_p1 := v_players[3]; v_team2_p2 := v_players[4];
    elsif v_pairing = 1 then
      v_team1_p1 := v_players[1]; v_team1_p2 := v_players[3]; v_team2_p1 := v_players[2]; v_team2_p2 := v_players[4];
    else
      v_team1_p1 := v_players[1]; v_team1_p2 := v_players[4]; v_team2_p1 := v_players[2]; v_team2_p2 := v_players[3];
    end if;

    insert into rounds (season_id, round_number, court_booker_id, court_confirmed, status)
    values (p_season_id, v_n, v_booker, false, 'scheduled')
    on conflict (season_id, round_number) do nothing
    returning id into v_round_id;

    if v_round_id is not null then
      insert into matches (round_id, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id)
      values (v_round_id, v_team1_p1, v_team1_p2, v_team2_p1, v_team2_p2);

      perform instantiate_round_questions(v_round_id);
    end if;
    v_round_id := null;
  end loop;
end;
$$;
