-- ============================================================
-- 068 · Operaciones del administrador
--
-- Para poder resolver desde la sección Admin cualquier problema operativo
-- (resultado, apuestas, reserva, precio, liquidación) sin SQL a mano.
--
-- Las funciones admin_* comprueban is_admin() y activan un interruptor
-- LOCAL a la transacción (`app.admin_override`) que solo los triggers de
-- integridad de apuestas respetan. Así el administrador puede corregir
-- apuestas sin abrir ningún hueco cuando juega con su cuenta normal.
-- ============================================================

-- ─── Importe de la pista: también el admin ──────────────────
create or replace function check_court_cost_editor()
returns trigger
language plpgsql
as $$
begin
  if new.court_cost is distinct from old.court_cost
     and auth.uid() is not null
     and not is_admin()
     and auth.uid() is distinct from old.court_booker_id then
    raise exception 'Solo quien reservó la pista (o el administrador) puede registrar lo que costó';
  end if;
  return new;
end;
$$;

-- ─── Triggers de apuestas: respetan el interruptor de admin ──
create or replace function check_market_open()
returns trigger as $$
declare
  v_resolved boolean;
  v_closes_at timestamptz;
  v_scheduled_date date;
  v_scheduled_time time;
  v_match_datetime timestamptz;
  v_market_id uuid;
  v_found boolean;
begin
  if current_setting('app.admin_override', true) = 'on' then
    return coalesce(new, old);
  end if;

  v_market_id := coalesce(new.market_id, old.market_id);

  select m.resolved, m.closes_at, r.scheduled_date, r.scheduled_time, true
    into v_resolved, v_closes_at, v_scheduled_date, v_scheduled_time, v_found
  from betting_markets m
  join rounds r on r.id = m.round_id
  where m.id = v_market_id;

  if tg_op = 'DELETE' then
    if v_found is null then
      return old;
    end if;
    if v_resolved then
      raise exception 'No se puede borrar una apuesta de un mercado ya resuelto';
    end if;
    if v_scheduled_date is not null and v_scheduled_time is not null then
      v_match_datetime := (v_scheduled_date + v_scheduled_time) at time zone 'Europe/Madrid' - interval '1 hour';
    end if;
    if coalesce(v_closes_at, v_match_datetime) is not null and coalesce(v_closes_at, v_match_datetime) <= now() then
      raise exception 'El plazo para apostar en este mercado ya ha cerrado';
    end if;
    return old;
  end if;

  if v_resolved then
    raise exception 'No se puede apostar en un mercado ya resuelto';
  end if;

  if v_closes_at is null then
    if v_scheduled_date is null or v_scheduled_time is null then
      raise exception 'Esta jornada todavía no tiene día y hora confirmados: no se puede apostar aún';
    end if;
    v_match_datetime := (v_scheduled_date + v_scheduled_time) at time zone 'Europe/Madrid' - interval '1 hour';
  end if;

  if coalesce(v_closes_at, v_match_datetime) <= now() then
    raise exception 'El plazo para apostar en este mercado ya ha cerrado';
  end if;

  return new;
end;
$$ language plpgsql security definer;

create or replace function check_min_paid_questions()
returns trigger
language plpgsql
as $$
declare
  v_paid int;
begin
  if current_setting('app.admin_override', true) = 'on' then
    return old;
  end if;
  if old.type = 'exact_score' then
    return old;
  end if;
  -- Si la jornada entera se está borrando (cascada), no aplica.
  if not exists (select 1 from rounds where id = old.round_id) then
    return old;
  end if;
  select count(*) into v_paid from betting_markets where round_id = old.round_id and type <> 'exact_score';
  if v_paid <= 6 then
    raise exception 'Cada jornada necesita al menos 6 preguntas de pago: no se puede borrar esta';
  end if;
  return old;
end;
$$;

-- ─── Deshacer una liquidación ───────────────────────────────
-- Misma reversa que hace settle_round al re-liquidar, pero sin volver a
-- liquidar: deja la jornada «sin liquidar» con sus preguntas resueltas.
create or replace function admin_unsettle_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev round_settlements%rowtype;
begin
  if not is_admin() then
    raise exception 'Solo el administrador puede hacer esto';
  end if;

  select * into v_prev from round_settlements where round_id = p_round_id and voided_at is null;
  if v_prev.id is null then
    raise exception 'Esta jornada no está liquidada';
  end if;

  update jackpots j set chips = j.chips + coalesce((
    select sum(case when jc.direction = 'out' then jc.chips else -jc.chips end)
    from jackpot_contributions jc
    where jc.round_id = p_round_id and jc.jackpot_id = j.id and jc.reason <> 'season_refund'
  ), 0), updated_at = now()
  where exists (
    select 1 from jackpot_contributions jc
    where jc.round_id = p_round_id and jc.jackpot_id = j.id and jc.reason <> 'season_refund'
  );

  delete from jackpot_contributions where round_id = p_round_id and reason <> 'season_refund';
  delete from betting_round_results where round_id = p_round_id;
  delete from market_settlement_entries where round_id = p_round_id;
  update round_settlements set voided_at = now() where id = v_prev.id;
end;
$$;

-- ─── Registrar / cambiar la apuesta de un jugador ───────────
-- Sustituye cualquier apuesta previa de ese jugador en la pregunta.
-- Se salta el cierre y el «mercado resuelto»; las reglas de fichas
-- (10-50, marcador exacto gratis) y la de no apostar por uno mismo en
-- respuestas negativas siguen vigentes.
create or replace function admin_set_bet(p_market_id uuid, p_player_id uuid, p_option_id uuid, p_chips int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo el administrador puede hacer esto';
  end if;
  if not exists (select 1 from betting_options where id = p_option_id and market_id = p_market_id) then
    raise exception 'Esa respuesta no pertenece a esta pregunta';
  end if;

  perform set_config('app.admin_override', 'on', true);
  delete from bets where market_id = p_market_id and player_id = p_player_id;
  insert into bets (market_id, option_id, player_id, chips)
  values (p_market_id, p_option_id, p_player_id, p_chips);
end;
$$;

create or replace function admin_delete_bet(p_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo el administrador puede hacer esto';
  end if;
  perform set_config('app.admin_override', 'on', true);
  delete from bets where id = p_bet_id;
end;
$$;

-- ─── Dejar una jornada como nueva (o parcialmente) ──────────
--   p_result:      quita el marcador y el ganador, y la jornada vuelve a «programada»
--   p_reservation: quita día, hora, club, precio y la confirmación de la reserva
--   p_bets:        borra todas las apuestas y reabre todas las preguntas
-- Las parejas y el responsable de la reserva no se tocan. Si estaba
-- liquidada, se deshace la liquidación antes.
create or replace function admin_reset_round(p_round_id uuid, p_result boolean, p_reservation boolean, p_bets boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo el administrador puede hacer esto';
  end if;
  if not exists (select 1 from rounds where id = p_round_id) then
    raise exception 'Jornada no encontrada';
  end if;

  perform set_config('app.admin_override', 'on', true);

  if (p_result or p_bets)
     and exists (select 1 from round_settlements where round_id = p_round_id and voided_at is null) then
    perform admin_unsettle_round(p_round_id);
  end if;

  if p_bets then
    delete from bets where market_id in (select id from betting_markets where round_id = p_round_id);
    update betting_markets set resolved = false, voided = false, winning_option_id = null where round_id = p_round_id;
    -- Opciones de marcador exacto que solo existían por apuestas ya borradas.
    delete from betting_options o
    using betting_markets m
    where o.market_id = m.id and m.round_id = p_round_id and m.type = 'exact_score'
      and not exists (select 1 from bets b where b.option_id = o.id);
  elsif p_result then
    -- Sin resultado, las preguntas que se resolvían por el marcador vuelven a estar abiertas.
    update betting_markets bm set resolved = false, voided = false, winning_option_id = null
    where bm.round_id = p_round_id
      and (bm.type = 'exact_score'
           or exists (select 1 from betting_question_templates t where t.id = bm.template_id and t.category = 'automatic'));
  end if;

  if p_result then
    update matches
       set winner = null, played_at = null,
           set1_t1 = null, set1_t2 = null, set2_t1 = null, set2_t2 = null,
           set3_t1 = null, set3_t2 = null
     where round_id = p_round_id;
    update rounds set status = 'scheduled' where id = p_round_id and status = 'played';
  end if;

  if p_reservation then
    update rounds
       set scheduled_date = null, scheduled_time = null, club = null,
           court_cost = null, court_confirmed = false,
           day_before_sent_at = null, reminder_120_sent_at = null, bet_against_notified_at = null
     where id = p_round_id;
  end if;
end;
$$;

grant execute on function admin_unsettle_round(uuid) to authenticated;
grant execute on function admin_set_bet(uuid, uuid, uuid, int) to authenticated;
grant execute on function admin_delete_bet(uuid) to authenticated;
grant execute on function admin_reset_round(uuid, boolean, boolean, boolean) to authenticated;
