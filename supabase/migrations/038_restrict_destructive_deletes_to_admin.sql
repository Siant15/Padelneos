-- ============================================================
-- Auditoría: seasons y rounds tenían una única política "for all to
-- authenticated using (true)", así que aunque deleteSeason/deleteRound
-- en lib/admin-actions.ts ya exigen assertIsAdmin() antes de llamar,
-- CUALQUIER jugador podía saltarse esa comprobación por completo
-- llamando directamente a supabase.from('seasons').delete()/
-- .from('rounds').delete() desde el navegador con su propia sesión —
-- la app lo impedía, la base de datos no.
--
-- Se restringe SOLO el borrado (DELETE) al admin — crear/editar
-- temporadas y jornadas sigue abierto a los 4 jugadores a propósito
-- (start_new_season/extend_active_season/generate_season_rounds no
-- son SECURITY DEFINER, así que dependen de que cualquier jugador
-- pueda insertar/actualizar estas tablas para poder crear una liga).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select (auth.jwt() ->> 'email') = 's.vallve93@gmail.com';
$$;

-- seasons
drop policy if exists "Seasons editables por autenticados" on seasons;
drop policy if exists "Seasons: insertar autenticados" on seasons;
drop policy if exists "Seasons: actualizar autenticados" on seasons;
drop policy if exists "Seasons: borrar solo admin" on seasons;

create policy "Seasons: insertar autenticados" on seasons
  for insert to authenticated with check (true);
create policy "Seasons: actualizar autenticados" on seasons
  for update to authenticated using (true) with check (true);
create policy "Seasons: borrar solo admin" on seasons
  for delete to authenticated using (is_admin());

-- rounds
drop policy if exists "Rounds editables por autenticados" on rounds;
drop policy if exists "Rounds: insertar autenticados" on rounds;
drop policy if exists "Rounds: actualizar autenticados" on rounds;
drop policy if exists "Rounds: borrar solo admin" on rounds;

create policy "Rounds: insertar autenticados" on rounds
  for insert to authenticated with check (true);
create policy "Rounds: actualizar autenticados" on rounds
  for update to authenticated using (true) with check (true);
create policy "Rounds: borrar solo admin" on rounds
  for delete to authenticated using (is_admin());
