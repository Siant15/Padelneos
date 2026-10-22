-- Marcador exacto: un solo pronóstico por jugador y pregunta. Al guardar
-- uno nuevo (otro marcador = otra opción) se sustituye el anterior; antes
-- se acumulaban y el jugador acababa con dos apuestas.

-- Limpieza: de los duplicados existentes se conserva el más reciente.
delete from bets b
using betting_markets m
where m.id = b.market_id and m.type = 'exact_score'
  and exists (
    select 1 from bets b2
    where b2.market_id = b.market_id and b2.player_id = b.player_id
      and (b2.created_at, b2.id) > (b.created_at, b.id)
  );

create or replace function replace_previous_exact_score_bet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from betting_markets where id = new.market_id and type = 'exact_score') then
    delete from bets
    where market_id = new.market_id and player_id = new.player_id and option_id <> new.option_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_replace_previous_exact_score_bet on bets;
create trigger trg_replace_previous_exact_score_bet
  before insert on bets
  for each row execute function replace_previous_exact_score_bet();
