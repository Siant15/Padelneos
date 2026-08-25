-- ============================================================
-- Clubs de pádel "registrados": cuando se busca uno por internet
-- (OpenStreetMap/Nominatim) y se elige, se guarda aquí su dirección y
-- enlace de Google Maps, para no tener que volver a buscarlo cada vez
-- y poder mostrar "Ver en Maps" donde aparezca el nombre del club.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

create table clubs (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  address text,
  maps_url text,
  lat double precision,
  lon double precision,
  created_at timestamptz default now()
);

alter table clubs enable row level security;
create policy "Clubs visibles para autenticados" on clubs for select to authenticated using (true);
create policy "Clubs editables por autenticados" on clubs for all to authenticated using (true);
