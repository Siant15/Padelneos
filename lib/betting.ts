import type { BettingMarket } from '@/lib/types'

export const CHIPS_PER_ROUND = 100
export const QUICK_BET_AMOUNT = 10

type RoundTiming = { scheduled_date: string | null; scheduled_time: string | null }

// Una jornada solo admite apuestas si tiene día y hora confirmados —
// si no, no hay hora de cierre por defecto y no se puede apostar
// (antes se dejaba abierto hasta una hora ficticia de las 23:59:59).
export function isRoundBettable(round: RoundTiming): boolean {
  return !!(round.scheduled_date && round.scheduled_time)
}

// Hora de cierre de un mercado: la suya propia si la tiene, y si no la
// hora del partido — o null si la jornada todavía no tiene día/hora,
// lo que significa "no se puede apostar todavía" (no "sin límite").
// Única función de cierre en toda la app — sustituye las copias que
// había en apuestas/[roundId]/page.tsx y BettingMarketsBoard.tsx.
export function marketCloseTime(market: { closes_at: string | null }, round: RoundTiming): string | null {
  if (market.closes_at) return market.closes_at
  if (!isRoundBettable(round)) return null
  return `${round.scheduled_date}T${round.scheduled_time}`
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
