-- ============================================================
-- 067 · Datos registrados que ya no se pueden cambiar (salvo el admin),
--        cierre de liga confirmado por un jugador y marcadores exactos
--        privados hasta el cierre del mercado.
--
-- Las comprobaciones de los triggers se saltan cuando no hay usuario
-- (auth.uid() null: SQL Editor y service role) y para el admin
-- (is_admin()), así que las correcciones del administrador siguen siendo
-- posibles.
-- ============================================================

-- ─── 1. Reserva registrada: día + hora + club ───────────────
-- Una vez la jornada tiene día, hora y club, nadie más puede
-- cambiarlos. (Poner por primera vez hora y club, o corregir la fecha
-- provisional mientras falten, sigue siendo libre.) El importe de la
-- pista tiene su propia regla (044).
create or replace function lock_registered_reservation()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if old.scheduled_date is not null
     and old.scheduled_time is not null
     and coalesce(old.club, '') <> ''
     and (
       new.scheduled_date is distinct from old.scheduled_date
       or new.scheduled_time is distinct from old.scheduled_time
       or new.club is distinct from old.club
     ) then
    raise exception 'La reserva ya está registrada (día, hora y club): solo el administrador puede cambiarla';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_registered_reservation on rounds;
create trigger trg_lock_registered_reservation
  before update on rounds
  for each row execute function lock_registered_reservation();

-- ─── 2. Parejas: una vez definidas, solo el admin las cambia ─
create or replace function lock_match_pairs()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if old.team1_p1_id is not null and old.team1_p2_id is not null
     and old.team2_p1_id is not null and old.team2_p2_id is not null
     and (
       new.team1_p1_id is distinct from old.team1_p1_id
       or new.team1_p2_id is distinct from old.team1_p2_id
       or new.team2_p1_id is distinct from old.team2_p1_id
       or new.team2_p2_id is distinct from old.team2_p2_id
     ) then
    raise exception 'Las parejas ya están definidas: solo el administrador puede cambiarlas';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_match_pairs on matches;
create trigger trg_lock_match_pairs
  before update on matches
  for each row execute function lock_match_pairs();

-- ─── 3. Jornada liquidada: resultado y respuestas congelados ─
create or replace function lock_settled_match()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if exists (select 1 from round_settlements s where s.round_id = old.round_id and s.voided_at is null)
     and (
       new.winner is distinct from old.winner
       or new.set1_t1 is distinct from old.set1_t1 or new.set1_t2 is distinct from old.set1_t2
       or new.set2_t1 is distinct from old.set2_t1 or new.set2_t2 is distinct from old.set2_t2
       or new.set3_t1 is distinct from old.set3_t1 or new.set3_t2 is distinct from old.set3_t2
     ) then
    raise exception 'Esta jornada ya está liquidada: solo el administrador puede corregir el resultado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_settled_match on matches;
create trigger trg_lock_settled_match
  before update on matches
  for each row execute function lock_settled_match();

create or replace function lock_settled_market()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if exists (select 1 from round_settlements s where s.round_id = old.round_id and s.voided_at is null)
     and (
       new.resolved is distinct from old.resolved
       or new.voided is distinct from old.voided
       or new.winning_option_id is distinct from old.winning_option_id
     ) then
    raise exception 'Esta jornada ya está liquidada: solo el administrador puede cambiar las respuestas';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_settled_market on betting_markets;
create trigger trg_lock_settled_market
  before update on betting_markets
  for each row execute function lock_settled_market();

-- ─── 4. Cerrar la liga: lo confirma un jugador ──────────────
-- Sustituye al cierre automático del cron. Cualquier jugador con sesión
-- puede cerrarla, pero solo cuando ya no queda ninguna jornada por jugar
-- ni ninguna jugada sin liquidar. Devuelve los botes pendientes.
create or replace function finish_season(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not exists (select 1 from seasons where id = p_season_id and status = 'active') then
    raise exception 'Esta liga ya está cerrada o no existe';
  end if;
  if exists (select 1 from rounds where season_id = p_season_id and status = 'scheduled') then
    raise exception 'Todavía quedan jornadas por jugar o cancelar';
  end if;
  if not exists (select 1 from rounds where season_id = p_season_id and status = 'played') then
    raise exception 'La liga no tiene ninguna jornada jugada';
  end if;
  if exists (
    select 1 from rounds r
    where r.season_id = p_season_id
      and r.status = 'played'
      and exists (select 1 from betting_markets m where m.round_id = r.id)
      and not exists (select 1 from round_settlements s where s.round_id = r.id and s.voided_at is null)
  ) then
    raise exception 'Hay jornadas jugadas con apuestas sin liquidar';
  end if;

  perform close_season_jackpots(p_season_id);
  update seasons set status = 'finished' where id = p_season_id;
end;
$$;

grant execute on function finish_season(uuid) to authenticated, service_role;

-- ─── 5. Marcador exacto: privado hasta el cierre ────────────
-- Las opciones de marcador exacto solo existen si alguien las pronosticó,
-- así que verlas antes del cierre revela pronósticos ajenos. Se ven las
-- propias (las que tienen tu apuesta) y todas cuando el mercado cierra.
drop policy if exists "Options visibles para autenticados" on betting_options;
create policy "Options: marcador exacto privado hasta el cierre" on betting_options
  for select to authenticated
  using (
    not exists (
      select 1 from betting_markets m
      where m.id = betting_options.market_id and m.type = 'exact_score'
    )
    or market_is_closed(market_id)
    or exists (
      select 1 from bets b
      where b.option_id = betting_options.id and b.player_id = auth.uid()
    )
  );

-- Los totales por opción tampoco deben delatar los marcadores exactos
-- antes del cierre (una fila por opción pronosticada).
create or replace function get_round_bet_totals(p_round_id uuid)
returns table(market_id uuid, option_id uuid, chips bigint)
language sql
security definer
set search_path = public
as $$
  select b.market_id, b.option_id, sum(b.chips)::bigint as chips
  from bets b
  join betting_markets m on m.id = b.market_id
  where m.round_id = p_round_id
    and (m.type <> 'exact_score' or market_is_closed(m.id))
  group by b.market_id, b.option_id;
$$;

create or replace function get_market_bet_totals(p_market_ids uuid[])
returns table(market_id uuid, option_id uuid, chips bigint)
language sql
security definer
set search_path = public
as $$
  select b.market_id, b.option_id, sum(b.chips)::bigint as chips
  from bets b
  join betting_markets m on m.id = b.market_id
  where b.market_id = any(p_market_ids)
    and (m.type <> 'exact_score' or market_is_closed(m.id))
  group by b.market_id, b.option_id;
$$;

grant execute on function get_round_bet_totals(uuid) to authenticated, service_role;
grant execute on function get_market_bet_totals(uuid[]) to authenticated, service_role;
