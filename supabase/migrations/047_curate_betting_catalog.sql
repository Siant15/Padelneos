-- ============================================================
-- Rediseño del catálogo de apuestas (parte A del rediseño del motor
-- de apuestas): dos preguntas fijas cada jornada ("Ganador del
-- partido" y "¿Habrá tercer set?"), un catálogo elegible reducido a
-- 12 plantillas, y 5 de esas 12 en blanco para que cualquier jugador
-- las defina a su gusto (ver migración de UI para editarlas).
-- ============================================================

-- Quitar el duplicado exacto de "Que pareja se discutirá antes?"
delete from betting_question_templates
where id = (
  select id from betting_question_templates
  where text = 'Que pareja se discutirá antes?'
  order by created_at desc
  limit 1
);

-- Preguntas fijas de cada jornada: solo estas dos.
update betting_question_templates set auto_apply = true
where text in ('Ganador del partido', '¿Habrá tercer set?');

-- El resto de lo que hoy es auto_apply pasa a elegible (ya no se
-- fuerza cada jornada) — "Marcador exacto" se sigue creando sola vía
-- instantiate_round_questions, pero fuera del cupo de 6 preguntas de
-- pago (es gratis), así que se queda con auto_apply=true aparte.
update betting_question_templates set auto_apply = false
where text in ('Resultado por sets', 'Primer jugador en llegar tarde', 'Primer jugador que comete doble falta', 'Primer jugador que hace un ace', 'Primer jugador que hace un smash al cristal', 'Primer jugador que hace un x3');

-- Catálogo elegible curado a 12: se quedan activas solo las 7 pedidas
-- (doble falta + ace emparejadas, ver migración de instantiate_round_questions)
-- más una nueva ("smash ganador") y 5 plantillas en blanco a definir.
update betting_question_templates set active = false
where text not in (
  'Ganador del partido', '¿Habrá tercer set?', 'Marcador exacto',
  'Primer jugador que hace un smash al cristal',
  'Primer jugador que comete doble falta',
  'Primer jugador que hace un ace',
  'Primer jugador en llegar tarde',
  'Primer jugador en recibir un pelotazo',
  'Primero en decir "mía" y perder el punto'
) and text not like 'Pregunta libre %' and text <> 'Primer jugador que hace un smash ganador';

insert into betting_question_templates (text, category, answer_type, auto_apply, active, allow_none)
select 'Primer jugador que hace un smash ganador', 'anecdotal', 'player', false, true, true
where not exists (select 1 from betting_question_templates where text = 'Primer jugador que hace un smash ganador');

-- 5 plantillas en blanco: cualquier jugador puede editarlas después
-- desde "Añadir más preguntas" (texto/tipo de respuesta) para que el
-- grupo decida qué preguntas quiere sin tocar la base de datos.
insert into betting_question_templates (text, category, answer_type, auto_apply, active, allow_none)
select 'Pregunta libre ' || n, 'anecdotal', 'player', false, true, true
from generate_series(1, 5) as n
where not exists (select 1 from betting_question_templates where text = 'Pregunta libre ' || n);
