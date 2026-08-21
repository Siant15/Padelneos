-- ============================================================
-- Notificaciones push: cada dispositivo suscrito guarda su
-- "push subscription" (endpoint + claves de cifrado del navegador).
-- Un jugador puede tener varios dispositivos suscritos.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid references profiles on delete cascade not null,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists "Cada jugador ve solo sus subscripciones" on push_subscriptions;
create policy "Cada jugador ve solo sus subscripciones"
  on push_subscriptions for select
  using (auth.uid() = player_id);

drop policy if exists "Cada jugador crea sus subscripciones" on push_subscriptions;
create policy "Cada jugador crea sus subscripciones"
  on push_subscriptions for insert
  with check (auth.uid() = player_id);

drop policy if exists "Cada jugador borra sus subscripciones" on push_subscriptions;
create policy "Cada jugador borra sus subscripciones"
  on push_subscriptions for delete
  using (auth.uid() = player_id);
