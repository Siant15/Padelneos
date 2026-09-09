-- ============================================================
-- Reajuste de las notificaciones de partido, pedido explícitamente:
-- 1) El aviso de "mañana toca partido" y el de "el partido empieza
--    en X min" solo deben mandarse cuando la reserva está realmente
--    confirmada (fecha + hora + club + € de pista, las 4 a la vez),
--    no solo con la fecha puesta.
-- 2) El recordatorio de última hora pasa de 90 a 120 minutos antes
--    del partido — se renombra la columna para que el nombre no
--    mienta sobre cuándo se manda.
-- 3) El aviso de "sales mencionado en una apuesta" se sustituye por
--    "alguien ha apostado en tu contra", que solo se dispara si de
--    verdad hay una apuesta hecha (no solo por ser una opción
--    disponible) y a los 60 min del partido (no del cierre del
--    mercado) — se renombra la columna para reflejarlo.
-- ============================================================
alter table rounds rename column reminder_90_sent_at to reminder_120_sent_at;
alter table rounds rename column mentions_notified_at to bet_against_notified_at;
