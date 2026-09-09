-- ============================================================
-- El aviso "dayBefore" (recordatorio de "mañana toca partido") era el
-- único de los tres tipos de notificación sin marca de "ya se avisó"
-- (reminder90 tiene reminder_90_sent_at desde la 037, marketMentions
-- tiene mentions_notified_at desde la 052). Si el cron de Vercel se
-- reintentase o se disparase a mano el mismo día, cada jugador
-- recibiría el mismo aviso duplicado sin ningún control que lo evite.
-- ============================================================
alter table rounds add column if not exists day_before_sent_at timestamptz;
