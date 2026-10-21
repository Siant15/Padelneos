-- ============================================================
-- Al añadir una pregunta a una jornada, quien la añade fija las
-- respuestas posibles en un popup (en vez de salir las que trae la
-- plantilla por defecto). La función crea la pregunta como siempre
-- (mismos límites de 10 y emparejamientos) y, justo después, sustituye
-- sus opciones por las indicadas — es seguro porque la pregunta acaba
-- de crearse y nadie ha podido apostar todavía.
-- ============================================================
create or replace function add_round_question_with_options(p_round_id uuid, p_template_id uuid, p_options jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tpl record;
  v_market_id uuid;
  v_opt jsonb;
begin
  select * into v_tpl from betting_question_templates where id = p_template_id;
  if v_tpl is null then
    raise exception 'Pregunta no encontrada';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 then
    raise exception 'Hacen falta al menos 2 respuestas';
  end if;
  if exists (select 1 from betting_markets where round_id = p_round_id and template_id = p_template_id) then
    raise exception 'Esta pregunta ya está en la jornada';
  end if;

  perform instantiate_round_questions(p_round_id, array[p_template_id]);

  select id into v_market_id from betting_markets where round_id = p_round_id and template_id = p_template_id;
  if v_market_id is null then
    raise exception 'No se pudo añadir la pregunta a esta jornada';
  end if;

  delete from betting_options where market_id = v_market_id;

  for v_opt in select * from jsonb_array_elements(p_options)
  loop
    insert into betting_options (market_id, label, value, player_id, is_none, is_self_negative)
    values (
      v_market_id,
      v_opt ->> 'label',
      coalesce(v_opt ->> 'value', v_opt ->> 'label'),
      nullif(v_opt ->> 'player_id', '')::uuid,
      coalesce((v_opt ->> 'is_none')::boolean, false),
      case when nullif(v_opt ->> 'player_id', '') is not null then not v_tpl.allow_self_bet else false end
    );
  end loop;
end;
$$;

grant execute on function add_round_question_with_options(uuid, uuid, jsonb) to authenticated;
