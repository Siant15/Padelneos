-- ============================================================
-- get_market_bet_totals(uuid[]) (042) obligaba a esperar a que
-- terminara la consulta de mercados para saber sus ids antes de
-- poder pedir los totales — un round-trip extra en serie en cada
-- carga de la pantalla de Mercados. Esta versión toma directamente
-- el round_id (que ya se conoce desde el principio) para poder
-- pedirse en paralelo con el resto de consultas de la página.
-- ============================================================

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
  group by b.market_id, b.option_id;
$$;

grant execute on function get_round_bet_totals(uuid) to authenticated;
