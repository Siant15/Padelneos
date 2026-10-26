// Cadencia de la liga: una jornada por semana, con una semana de pausa
// después de cada 3 partidos (J3→J4, J6→J7...). Cada fecha futura se
// calcula a partir de la anterior, no de un calendario fijo.
export const MATCHES_BEFORE_BREAK = 3

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Días entre la jornada `prevRoundNumber` y la siguiente: 7, o 14 si toca pausa. */
export function daysUntilNextRound(prevRoundNumber: number): number {
  return prevRoundNumber % MATCHES_BEFORE_BREAK === 0 ? 14 : 7
}
