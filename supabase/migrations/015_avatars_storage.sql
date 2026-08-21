-- ============================================================
-- Bucket público para las fotos de perfil (ya existe la columna
-- profiles.avatar_url, solo faltaba dónde guardar el fichero).
-- Cada jugador solo puede subir/borrar su propio archivo (nombrado
-- como su user id), pero cualquiera puede verlas (son públicas).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatares visibles para todos" on storage.objects;
create policy "Avatares visibles para todos"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Cada jugador sube su propio avatar" on storage.objects;
create policy "Cada jugador sube su propio avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Cada jugador actualiza su propio avatar" on storage.objects;
create policy "Cada jugador actualiza su propio avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Cada jugador borra su propio avatar" on storage.objects;
create policy "Cada jugador borra su propio avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
