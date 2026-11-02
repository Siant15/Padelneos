-- ============================================================
-- Parte B: las apuestas de todos se ven desde el CIERRE del mercado
-- (1 h antes del partido, o su closes_at propio), no solo cuando la
-- pregunta ya está resuelta. Desde el cierre nadie puede cambiar nada,
-- así que ya no hay estrategia que proteger; antes del cierre siguen
-- ocultas (nadie copia en el último minuto).
--
-- Parte C: todas las funciones de public eran ejecutables SIN sesión
-- (004_fix_grants.sql las abrió a `anon` y ninguna migración lo
-- revirtió). Con la clave anónima, que es pública, cualquiera podía
-- llamar a settle_round, update_template_text, etc. Se retira EXECUTE
-- a anon/public y se deja solo para usuarios con sesión y el servidor.
-- ============================================================

-- ─── B ─────────────────────────────────────────────────────
create or replace function market_is_closed(p_market_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    m.resolved
    or m.voided
    or (m.closes_at is not null and m.closes_at <= now())
    or (
      m.closes_at is null
      and r.scheduled_date is not null
      and r.scheduled_time is not null
      and ((r.scheduled_date + r.scheduled_time) at time zone 'Europe/Madrid') - interval '1 hour' <= now()
    ),
    false
  )
  from betting_markets m
  join rounds r on r.id = m.round_id
  where m.id = p_market_id;
$$;

drop policy if exists "Bets: propias o de mercado ya cerrado" on bets;
create policy "Bets: propias o de mercado ya cerrado" on bets
  for select to authenticated
  using (auth.uid() = player_id or market_is_closed(market_id));

-- ─── C ─────────────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Funciones que se creen en el futuro: sin EXECUTE para anon/public.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
