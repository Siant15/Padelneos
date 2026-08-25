-- ============================================================
-- instantiate_round_questions (018_betting_templates_and_questions.sql)
-- tenía un bug en la rama 'custom_options': el INSERT declaraba 3
-- columnas (market_id, label, value) pero el SELECT solo devolvía 2
-- expresiones (le faltaba v_market_id) -- "Insert has more target
-- columns than expressions". Aquí se redefine con esa única línea
-- corregida, el resto de la función queda igual.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

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
      select v_market_id, opt ->> 'label', opt ->> 'value'
      from jsonb_array_elements(coalesce(v_tpl.options, '[]'::jsonb)) opt;
      if v_tpl.allow_none then
        insert into betting_options (market_id, label, value, is_none) values (v_market_id, 'Ninguno', 'none', true);
      end if;

    -- exact_score: sin opciones iniciales; se crean bajo demanda al
    -- apostar (ver instantiate_exact_score_option).
    end if;
  end loop;
end;
$$;

grant execute on function instantiate_round_questions(uuid, uuid[]) to authenticated;
