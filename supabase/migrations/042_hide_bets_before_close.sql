-- ============================================================
-- `bets` tenía SELECT abierto a "true" para cualquier autenticado
-- (comentario original: "para el mercado pari-mutuel" — se necesita
-- ver el total apostado por opción). El problema es que eso expone
-- fila a fila quién apostó qué antes de que el mercado cierre,
-- revelando la estrategia de cada jugador. Se restringe SELECT a
-- "tu propia apuesta, o cualquiera si el mercado ya está resuelto/
-- anulado", y se añade una función que da el TOTAL por opción (sin
-- identidad de quién apostó) para que la vista de "fichas en juego"
-- siga funcionando igual mientras el mercado está abierto.
-- ============================================================

drop policy if exists "Bets visibles para autenticados" on bets;
create policy "Bets: propias o de mercado ya cerrado" on bets
  for select to authenticated
  using (
    auth.uid() = player_id
    or exists (
      select 1 from betting_markets m
      where m.id = bets.market_id and (m.resolved or m.voided)
    )
  );

create or replace function get_market_bet_totals(p_market_ids uuid[])
returns table(market_id uuid, option_id uuid, chips bigint)
language sql
security definer
set search_path = public
as $$
  select b.market_id, b.option_id, sum(b.chips)::bigint as chips
  from bets b
  where b.market_id = any(p_market_ids)
  group by b.market_id, b.option_id;
$$;

grant execute on function get_market_bet_totals(uuid[]) to authenticated;
