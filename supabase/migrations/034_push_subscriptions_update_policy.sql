-- ============================================================
-- 016_push_subscriptions.sql definió políticas de select/insert/delete
-- para push_subscriptions, pero nunca una de UPDATE. El cliente guarda
-- la suscripción con upsert(..., {onConflict: 'endpoint'}) -- la
-- primera vez es un INSERT normal, pero cualquier reintento con el
-- mismo endpoint (habitual: el navegador reutiliza el mismo endpoint
-- de push al volver a suscribirse) cae en UPDATE ... ON CONFLICT y,
-- sin política de update, RLS lo bloquea con "new row violates row
-- level security policy".
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

drop policy if exists "Cada jugador actualiza sus subscripciones" on push_subscriptions;
create policy "Cada jugador actualiza sus subscripciones"
  on push_subscriptions for update
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);
