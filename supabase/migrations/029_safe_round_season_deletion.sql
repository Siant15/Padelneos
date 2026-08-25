-- ============================================================
-- El panel de administración necesita poder borrar una jornada o una
-- temporada entera de forma limpia. Casi todo ya cascada bien desde
-- rounds/seasons (matches, betting_markets, bets, betting_round_results,
-- round_settlements, market_settlement_entries), pero dos tablas del
-- sistema de jackpots todavía bloquean el borrado:
--   - jackpot_contributions.round_id no tenía cascada (por eso registra
--     de dónde viene cada bote incluso después de liquidar la jornada);
--     se cambia a SET NULL, que es justo lo que ya significa null en
--     esta columna para los reembolsos de fin de temporada.
--   - jackpots.season_id no tenía cascada; si se borra la temporada, no
--     tiene sentido conservar su bote.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

alter table jackpot_contributions drop constraint jackpot_contributions_round_id_fkey;
alter table jackpot_contributions
  add constraint jackpot_contributions_round_id_fkey
  foreign key (round_id) references rounds(id) on delete set null;

alter table jackpots drop constraint jackpots_season_id_fkey;
alter table jackpots
  add constraint jackpots_season_id_fkey
  foreign key (season_id) references seasons(id) on delete cascade;
