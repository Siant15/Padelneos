import type { BettingMarket } from '@/lib/types'

export const CHIPS_PER_ROUND = 100
export const QUICK_BET_AMOUNT = 10

type RoundTiming = { scheduled_date: string | null; scheduled_time: string | null }

// Interpreta una fecha+hora como hora local de Madrid (con o sin
// verano, calculado para esa fecha concreta) y devuelve el instante
// UTC real. Hace falta porque esta misma función se llama tanto en el
// navegador (donde `new Date("...T...")` sin zona ya se interpreta en
// hora local del dispositivo, normalmente Madrid) como en el servidor
// del cron de notificaciones (donde se interpreta en UTC del propio
// servidor) — sin esto, el cierre de mercado y los avisos push
// calculados en el servidor quedan 1-2h desviados según la época del
// año.
export function madridDateTimeToUtc(dateStr: string, timeStr: string): Date {
  const guess = new Date(`${dateStr}T${timeStr}Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess).reduce((acc, p) => { acc[p.type] = p.value; return acc }, {} as Record<string, string>)
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second)
  const offsetMs = asIfUtc - guess.getTime()
  return new Date(guess.getTime() - offsetMs)
}

// Una jornada solo admite apuestas si tiene día y hora confirmados —
// si no, no hay hora de cierre por defecto y no se puede apostar
// (antes se dejaba abierto hasta una hora ficticia de las 23:59:59).
export function isRoundBettable(round: RoundTiming): boolean {
  return !!(round.scheduled_date && round.scheduled_time)
}

// Cuánto antes del partido cierra el mercado de apuestas por defecto
// (si el mercado no tiene su propio closes_at) — ya no se puede
// apostar in extremis justo antes de empezar.
const CLOSE_BEFORE_MATCH_MS = 60 * 60 * 1000

// Hora de cierre de un mercado: la suya propia si la tiene, y si no
// una hora antes del partido — o null si la jornada todavía no tiene
// día/hora, lo que significa "no se puede apostar todavía" (no "sin
// límite"). Única función de cierre en toda la app — sustituye las
// copias que había en apuestas/[roundId]/page.tsx y
// BettingMarketsBoard.tsx.
export function marketCloseTime(market: { closes_at: string | null }, round: RoundTiming): string | null {
  if (market.closes_at) return market.closes_at
  if (!isRoundBettable(round)) return null
  const matchDateTime = madridDateTimeToUtc(round.scheduled_date!, round.scheduled_time!)
  return new Date(matchDateTime.getTime() - CLOSE_BEFORE_MATCH_MS).toISOString()
}

export function isMarketOpenForBetting(market: Pick<BettingMarket, 'resolved' | 'closes_at'>, round: RoundTiming, roundStatus: string): boolean {
  if (roundStatus !== 'scheduled' || market.resolved) return false
  const closeTime = marketCloseTime(market, round)
  if (closeTime === null) return false
  return new Date(closeTime) > new Date()
}

// Marcador exacto canónico para las apuestas de tipo "exact_score":
// mismo formato que introduce el usuario, p. ej. "6-4,3-6,6-3" — así
// dos apuestas al mismo resultado comparten la misma opción/bote.
export function canonicalExactScore(sets: { t1: number; t2: number }[]): string {
  return sets.map(s => `${s.t1}-${s.t2}`).join(',')
}

export const ANSWER_TYPE_ICON: Record<string, string> = {
  pair: '🎾',
  player: '🎯',
  yes_no: '❔',
  sets_score: '📊',
  exact_score: '🔢',
  custom_options: '📋',
  player_choice: '🎯',
  quantity: '📋',
}
