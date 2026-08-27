-- ============================================================
-- Auditoría: 035_season_first_match_date.sql añadió un tercer
-- parámetro con default a start_new_season, pero en Postgres la
-- identidad de una función la determinan los TIPOS de sus parámetros
-- — así que start_new_season(text,int,date) no sustituyó a
-- start_new_season(text,int) (definida en 017/020), sino que creó una
-- sobrecarga nueva y dejó la de 2 argumentos huérfana y con su GRANT
-- de 017 todavía vigente. Cualquier llamada con solo 2 argumentos
-- ejecutaría la lógica antigua (sin fecha del primer partido) en vez
-- de fallar o usar la versión nueva.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

drop function if exists start_new_season(text, int);
