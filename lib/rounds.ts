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

// Reserva registrada = día, hora y club a la vez. Desde ahí solo el
// administrador puede cambiarla (trigger 067), y rescheduleFollowingRounds
// la trata como ancla: no la mueve.
export function isReservationRegistered(r: { scheduled_date: string | null; scheduled_time: string | null; club: string | null }): boolean {
  return !!(r.scheduled_date && r.scheduled_time && r.club)
}

// La liga ha terminado cuando no queda ninguna jornada programada y hay al
// menos una jugada (las canceladas no cuentan). Un solo criterio para Inicio
// y Liga; cerrar la liga lo confirma un jugador (RPC finish_season).
export function leagueFinished(rounds: { status: string }[]): boolean {
  return rounds.length > 0 && !rounds.some(r => r.status === 'scheduled') && rounds.some(r => r.status === 'played')
}
