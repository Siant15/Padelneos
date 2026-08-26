-- ============================================================
-- Limpia del catálogo ("+ Añadir más preguntas") las plantillas que
-- llevan 5 jornadas seguidas sin usarse, para que la lista no crezca
-- indefinidamente con preguntas que nadie vuelve a elegir. El "hace
-- cuántas jornadas" se mide en jornadas GLOBALES (todas las
-- temporadas, por orden de creación), no solo dentro de la temporada
-- activa, porque una plantilla puede reutilizarse en cualquier liga.
-- Solo se borran plantillas que se hayan usado alguna vez y no sean
-- auto_apply — las recién creadas sin usar todavía no se tocan.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function prune_stale_question_templates()
returns void
language plpgsql
as $$
begin
  with ordered_rounds as (
    select id, row_number() over (order by created_at) as seq from rounds
  ),
  latest as (
    select max(seq) as latest_seq from ordered_rounds
  ),
  last_used as (
    select m.template_id, max(o.seq) as last_seq
    from betting_markets m
    join ordered_rounds o on o.id = m.round_id
    where m.template_id is not null
    group by m.template_id
  )
  delete from betting_question_templates t
  using latest l, last_used lu
  where t.id = lu.template_id
    and t.auto_apply = false
    and lu.last_seq <= l.latest_seq - 5;
end;
$$;

grant execute on function prune_stale_question_templates() to authenticated;
