-- ============================================================
-- Marca de "ya se avisó" para el recordatorio de 90 minutos antes del
-- partido: como se comprueba cada 15 min (GitHub Actions, ver
-- .github/workflows/reminder-90.yml), hace falta esta columna para no
-- mandar el mismo aviso varias veces dentro de la ventana en la que
-- "quedan ~90 min" sigue siendo cierto.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

alter table rounds add column if not exists reminder_90_sent_at timestamptz;
