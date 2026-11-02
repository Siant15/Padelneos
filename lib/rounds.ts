// "Hoy" en hora de Madrid (YYYY-MM-DD). Con toISOString() se usa la fecha UTC,
// que entre las 00:00 y las 02:00 de Madrid todavía es "ayer".
export function todayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// Columnas de avisos push ya enviados: hay que ponerlas a null cuando cambia
// el día o la hora, o la nueva fecha nunca recibiría sus avisos.
export const RESET_NOTIFICATION_FLAGS = {
  day_before_sent_at: null,
  reminder_120_sent_at: null,
  bet_against_notified_at: null,
} as const
