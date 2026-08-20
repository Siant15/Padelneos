-- ============================================================
-- Añadimos el club/pista donde se juega, igual que la hora: uno
-- habitual para toda la temporada y opcionalmente uno distinto por
-- jornada si un partido concreto se juega en otro sitio.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

alter table seasons add column if not exists default_club text;
alter table rounds add column if not exists club text;
