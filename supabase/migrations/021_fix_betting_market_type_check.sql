-- ============================================================
-- La migración 018 dejó fuera 'player' de la lista de tipos válidos de
-- betting_markets.type — las plantillas de tipo "jugador" usan
-- exactamente ese valor (answer_type = 'player'), así que
-- instantiate_round_questions() fallaba al crear cualquier pregunta
-- de jugador (llegar tarde, doble falta, ace, x3, smash al cristal,
-- MVP, mueble...). Se mantienen los valores antiguos por compatibilidad.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

do $$
declare
  v_constraint_name text;
begin
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
