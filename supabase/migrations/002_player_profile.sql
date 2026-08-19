-- ============================================================
-- Perfil de jugador: pala, mano dominante, lado preferido
-- Ejecutar en Supabase SQL Editor
-- ============================================================

alter table profiles
  add column if not exists racket_brand text,
  add column if not exists dominant_hand text check (dominant_hand in ('diestra', 'zurda')),
  add column if not exists preferred_side text check (preferred_side in ('drive', 'reves'));

-- Cada usuario puede actualizar su propio perfil (incluye ahora estos campos)
-- La policy "Cada usuario edita su propio perfil" ya cubre update de cualquier columna propia.
