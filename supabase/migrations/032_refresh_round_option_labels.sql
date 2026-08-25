-- ============================================================
-- Al cambiar el emparejamiento de una jornada desde "Editar jornada",
-- los textos de las opciones de "Ganador del partido" y "Resultado por
-- sets" se quedaban con las parejas antiguas — la resolución en sí
-- siempre fue correcta (se decide por el "slot" team1/team2, que se
-- recalcula en vivo desde el partido real), pero el texto mostrado no
-- se actualizaba nunca porque solo se escribe una vez al crear las
-- preguntas. Esta función recalcula esos textos; se llama después de
-- guardar el emparejamiento en editar/page.tsx.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function refresh_round_option_labels(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_match record;
  v_pair_a_label text;
  v_pair_b_label text;
  v_market record;
begin
  select p1.name as p1_name, p2.name as p2_name, p3.name as p3_name, p4.name as p4_name
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

  for v_market in select id, type from betting_markets where round_id = p_round_id and type in ('pair', 'sets_score')
  loop
    if v_market.type = 'pair' then
      update betting_options set label = v_pair_a_label where market_id = v_market.id and value = 'team1';
      update betting_options set label = v_pair_b_label where market_id = v_market.id and value = 'team2';
    elsif v_market.type = 'sets_score' then
      update betting_options set label = v_pair_a_label || ' gana 2-0' where market_id = v_market.id and value = 'team1_2_0';
      update betting_options set label = v_pair_a_label || ' gana 2-1' where market_id = v_market.id and value = 'team1_2_1';
      update betting_options set label = v_pair_b_label || ' gana 2-0' where market_id = v_market.id and value = 'team2_2_0';
      update betting_options set label = v_pair_b_label || ' gana 2-1' where market_id = v_market.id and value = 'team2_2_1';
    end if;
  end loop;
end;
$$;

grant execute on function refresh_round_option_labels(uuid) to authenticated;
