-- ============================================================
-- Editar el texto de una pregunta del catálogo (AddQuestionPicker)
-- solo tocaba `betting_question_templates.text` — como
-- `betting_markets.description` se copia una vez al instanciar la
-- jornada y nunca se resincroniza, el cambio no se veía ni siquiera
-- en la jornada en curso hasta la siguiente que se creara. Se pide
-- lo contrario de lo que hacía antes de esto (nada) y de lo que
-- haría un `update` a lo bruto (tocar también jornadas ya jugadas):
-- que afecte a la jornada en curso y a las futuras, pero nunca a
-- una jornada ya jugada (su acta y sus apuestas ya están cerradas).
create or replace function update_template_text(p_template_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update betting_question_templates set text = p_text where id = p_template_id;

  update betting_markets bm
  set description = p_text
  from rounds r
  where bm.round_id = r.id
    and bm.template_id = p_template_id
    and r.status <> 'played';
end;
$$;

grant execute on function update_template_text(uuid, text) to authenticated;
