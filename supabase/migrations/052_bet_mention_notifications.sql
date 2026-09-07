-- ============================================================
-- Parte E del rediseño del motor de apuestas: aviso push a cada
-- jugador si sale mencionado como opción en alguna pregunta de tipo
-- jugador de la jornada, justo antes de que cierre el mercado.
-- ============================================================
alter table rounds add column if not exists mentions_notified_at timestamptz;
