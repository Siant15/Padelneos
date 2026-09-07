-- ============================================================
-- Refina la regla de "no apostar por ti mismo": solo se aplica a
-- preguntas que dependen ENTERAMENTE de la ejecución del propio
-- jugador (primera doble falta, primer smash al cristal). En "primer
-- ace" y "primer smash ganador" el resultado depende también del
-- rival (que no la devuelva), así que cualquiera puede apostar por sí
-- mismo. Además: "smash al cristal" y "smash ganador" van siempre
-- emparejadas, igual que ya pasaba con "doble falta"/"ace".
-- ============================================================
alter table betting_question_templates add column if not exists allow_self_bet boolean not null default false;

update betting_question_templates set allow_self_bet = true
where text in ('Primer jugador que hace un ace', 'Primer jugador que hace un smash ganador');

create or replace function instantiate_round_questions(p_round_id uuid, p_template_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_tpl record;
  v_market_id uuid;
  v_pair_a_label text;
  v_pair_b_label text;
  v_paid_count int;
  v_ace_id uuid;
  v_dfalta_id uuid;
  v_smash_cristal_id uuid;
  v_smash_ganador_id uuid;
  v_final_ids uuid[];
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

  select count(*) into v_paid_count
  from betting_markets bm
  join betting_question_templates t on t.id = bm.template_id
  where bm.round_id = p_round_id and t.answer_type <> 'exact_score';

  if p_template_ids is null then
    v_final_ids := null;
  else
    select id into v_dfalta_id from betting_question_templates where text = 'Primer jugador que comete doble falta';
    select id into v_ace_id from betting_question_templates where text = 'Primer jugador que hace un ace';
    select id into v_smash_cristal_id from betting_question_templates where text = 'Primer jugador que hace un smash al cristal';
    select id into v_smash_ganador_id from betting_question_templates where text = 'Primer jugador que hace un smash ganador';
    v_final_ids := p_template_ids;

    if v_dfalta_id = any(p_template_ids) and not (v_ace_id = any(p_template_ids)) then
      v_final_ids := array_append(v_final_ids, v_ace_id);
    elsif v_ace_id = any(p_template_ids) and not (v_dfalta_id = any(p_template_ids)) then
      v_final_ids := array_append(v_final_ids, v_dfalta_id);
    end if;

    if v_smash_cristal_id = any(p_template_ids) and not (v_smash_ganador_id = any(v_final_ids)) then
      v_final_ids := array_append(v_final_ids, v_smash_ganador_id);
    elsif v_smash_ganador_id = any(p_template_ids) and not (v_smash_cristal_id = any(v_final_ids)) then
      v_final_ids := array_append(v_final_ids, v_smash_cristal_id);
    end if;

    if v_paid_count + (
      select count(*) from betting_question_templates t
      where t.id = any(v_final_ids) and t.answer_type <> 'exact_score'
        and not exists (select 1 from betting_markets bm2 where bm2.round_id = p_round_id and bm2.template_id = t.id)
    ) > 6 then
      raise exception 'Esta jornada ya tiene el máximo de 6 preguntas de pago';
    end if;
  end if;

  for v_tpl in
    select * from betting_question_templates
    where active
      and (
        (p_template_ids is null and auto_apply)
        or (p_template_ids is not null and id = any (v_final_ids))
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
        (v_market_id, v_match.p1_name, v_match.team1_p1_id, not v_tpl.allow_self_bet),
        (v_market_id, v_match.p2_name, v_match.team1_p2_id, not v_tpl.allow_self_bet),
        (v_market_id, v_match.p3_name, v_match.team2_p1_id, not v_tpl.allow_self_bet),
        (v_market_id, v_match.p4_name, v_match.team2_p2_id, not v_tpl.allow_self_bet);
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
