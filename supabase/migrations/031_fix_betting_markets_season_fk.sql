-- ============================================================
-- La migración 029 arregló jackpots.season_id y
-- jackpot_contributions.round_id para poder borrar una temporada, pero
-- se quedó fuera betting_markets.season_id (referencia directa a
-- seasons, además de la que ya tiene a través de round_id) — Postgres
-- la sigue bloqueando aunque la de round_id ya cascade. Se arregla
-- igual que las otras dos.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

alter table betting_markets drop constraint betting_markets_season_id_fkey;
alter table betting_markets
  add constraint betting_markets_season_id_fkey
  foreign key (season_id) references seasons(id) on delete cascade;
