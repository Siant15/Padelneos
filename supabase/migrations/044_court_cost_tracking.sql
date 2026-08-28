-- ============================================================
-- Registro de cuánto costó la pista en cada jornada (la paga quien
-- reservó, `court_booker_id`, y el precio varía según club/hora) —
-- para poder calcular al final de temporada quién ha pagado de más
-- y a quién le toca compensar.
-- ============================================================

alter table rounds add column if not exists court_cost numeric(6,2);

-- Solo quien era responsable de la reserva de esa jornada puede
-- registrar/cambiar lo que costó — el resto de campos de la jornada
-- (día, hora, parejas...) los sigue pudiendo tocar cualquiera, como
-- hasta ahora.
create or replace function check_court_cost_editor()
returns trigger
language plpgsql
as $$
begin
  if new.court_cost is distinct from old.court_cost and auth.uid() is distinct from old.court_booker_id then
    raise exception 'Solo quien reservó la pista puede registrar lo que costó';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_court_cost_editor on rounds;
create trigger trg_check_court_cost_editor
  before update on rounds
  for each row execute function check_court_cost_editor();
