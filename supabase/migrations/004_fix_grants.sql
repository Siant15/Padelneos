-- ============================================================
-- Corrige "permission denied for table X": las políticas RLS ya
-- existían, pero faltaban los GRANT de privilegios a nivel de tabla
-- para los roles anon/authenticated (Supabase los da por defecto al
-- crear el proyecto, pero pueden faltar si se restauró/reconfiguró).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
