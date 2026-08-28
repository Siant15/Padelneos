-- ============================================================
-- match_stats (aces, dobles faltas, "bolas por 3", "smash al
-- cristal") se decidió quitar de la app: era demasiado complejo
-- recordar y anotar esos datos de cada jugador partido a partido.
-- Ningún código de la app lo escribe ni lo lee ya — se borra la
-- tabla entera en vez de dejarla abandonada.
-- ============================================================

drop table if exists match_stats;
