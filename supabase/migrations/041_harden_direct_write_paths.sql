-- ============================================================
-- Cierra el hueco que dejó la 038: varias tablas de apuestas
-- (betting_options, betting_round_results, jackpots,
-- jackpot_contributions, round_settlements) seguían con una
-- política "for all to authenticated using (true)" heredada de la
-- 001/019/020, lo que permite a cualquier jugador editar o borrar
-- directamente resultados de liquidación o jackpots desde el
-- cliente, saltándose por completo las funciones que existen
-- justo para eso (settle_round, auto_resolve_round_markets...).
--
-- Ninguna de esas tablas se escribe nunca directamente desde la
-- app (confirmado: solo se tocan a través de esas funciones RPC),
-- así que se les retira el permiso de escritura a "authenticated"
-- por completo. Para que las funciones sigan funcionando igual
-- para cualquiera de los 4 jugadores (no son solo del admin), se
-- convierten en SECURITY DEFINER: así se ejecutan con los permisos
-- de quien las creó (que sí puede escribir esas tablas) en vez de
-- con los del jugador que las llama, y RLS deja de aplicarles.
alter function instantiate_round_questions(uuid, uuid[]) security definer set search_path = public;
alter function auto_resolve_round_markets(uuid) security definer set search_path = public;
alter function settle_round(uuid) security definer set search_path = public;
alter function close_season_jackpots(uuid) security definer set search_path = public;
alter function refresh_round_option_labels(uuid) security definer set search_path = public;

-- match_stats: tabla definida en 001 pero que ningún flujo actual
-- (ni la app ni ninguna función) escribe — se retira también el
-- permiso de escritura en vez de dejar una puerta sin usar.
drop policy if exists "Stats editables por autenticados" on match_stats;

drop policy if exists "Options editables por autenticados" on betting_options;
drop policy if exists "Betting results editables por autenticados" on betting_round_results;
drop policy if exists "Jackpots editables por autenticados" on jackpots;
drop policy if exists "Contribuciones editables por autenticados" on jackpot_contributions;
drop policy if exists "Liquidaciones editables por autenticados" on round_settlements;

-- matches: el cliente sí crea/edita el partido de una jornada
-- (parejas, resultado) directamente, pero nunca lo borra — solo se
-- borra en cascada al borrar la jornada, que ya pasa por el Server
-- Action de admin (service_role, bypasa RLS). Se restringe el
-- borrado directo a admin, igual que se hizo con seasons/rounds.
drop policy if exists "Matches editables por autenticados" on matches;
create policy "Matches: insertar autenticados" on matches
  for insert to authenticated with check (true);
create policy "Matches: actualizar autenticados" on matches
  for update to authenticated using (true) with check (true);
create policy "Matches: borrar solo admin" on matches
  for delete to authenticated using (is_admin());

-- betting_markets: crear/editar (resolver, anular) sigue abierto a
-- cualquiera, pero borrar solo se permite mientras la pregunta no
-- esté ya resuelta/anulada — así un jugador no puede borrar una
-- pregunta ya decidida (con su apuesta perdedora) para esquivar la
-- liquidación, que es justo el bypass que la 039 quiso cerrar un
-- nivel más abajo (en `bets`) sin darse cuenta de que seguía
-- abierto aquí, en el mercado que arrastra en cascada sus apuestas.
drop policy if exists "Markets editables por autenticados" on betting_markets;
create policy "Markets: insertar autenticados" on betting_markets
  for insert to authenticated with check (true);
create policy "Markets: actualizar autenticados" on betting_markets
  for update to authenticated using (true) with check (true);
create policy "Markets: borrar solo si no resuelta" on betting_markets
  for delete to authenticated using (not resolved and not voided);

-- bets: la política de update ya se comportaba correctamente (Postgres
-- reutiliza el USING como WITH CHECK implícito cuando no se da uno),
-- pero se deja explícito para que quede documentado y no se rompa si
-- alguien añade un WITH CHECK distinto más adelante sin fijarse en
-- este comentario.
drop policy if exists "Bets: editar propias" on bets;
create policy "Bets: editar propias" on bets
  for update to authenticated using (auth.uid() = player_id) with check (auth.uid() = player_id);
