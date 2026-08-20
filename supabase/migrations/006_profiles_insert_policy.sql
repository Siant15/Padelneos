-- ============================================================
-- Corrige "new row violates row-level security policy for table
-- profiles" al guardar el perfil: faltaba la política de INSERT.
-- El guardado de perfil usa upsert (insert + update en uno), y sin
-- policy de insert, Postgres rechaza el upsert entero aunque la fila
-- ya exista (el tipo de sentencia es INSERT antes de resolver el
-- conflicto).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create policy "Cada usuario crea su propio perfil"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);
