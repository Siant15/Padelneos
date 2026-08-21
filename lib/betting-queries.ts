import type { SupabaseClient } from '@supabase/supabase-js'
import { CHIPS_PER_ROUND, isMarketOpenForBetting } from '@/lib/betting'
import type { BettingMarket } from '@/lib/types'

// ─── Contexto de apuestas de una jornada concreta ──────────────────
// Única fuente de datos para "poder apostar en esta jornada": la usan
// tanto /apuestas/[roundId] como las dos zonas de Inicio, así nunca
// hay saldos ni preguntas calculadas dos veces por separado.
export type RoundBettingContext = {
  round: { id: string; round_number: number; scheduled_date: string | null; scheduled_time: string | null; status: string; season_id: string } | null
  markets: BettingMarket[]
  openMarketsCount: number
  chipsUsed: number
  chipsLeft: number
  isSettled: boolean
}

export async function getRoundBettingContext(supabase: SupabaseClient, roundId: string, userId: string): Promise<RoundBettingContext> {
  const [{ data: round }, { data: markets }, { data: settlement }] = await Promise.all([
    supabase.from('rounds').select('id, round_number, scheduled_date, scheduled_time, status, season_id').eq('id', roundId).maybeSingle(),
    supabase.from('betting_markets')
      .select('*, options:betting_options!market_id(*, player:profiles(id, name)), bets(*)')
      .eq('round_id', roundId)
      .order('created_at'),
    supabase.from('round_settlements').select('id').eq('round_id', roundId).is('voided_at', null).maybeSingle(),
  ])

  const marketList = (markets as BettingMarket[] | null) ?? []
  const chipsUsed = round
    ? marketList.reduce((sum, m) => sum + (m.bets?.filter(b => b.player_id === userId).reduce((s, b) => s + b.chips, 0) ?? 0), 0)
    : 0
  const openMarketsCount = round
    ? marketList.filter(m => isMarketOpenForBetting(m, round, round.status)).length
    : 0

  return {
    round,
    markets: marketList,
    openMarketsCount,
    chipsUsed,
    chipsLeft: CHIPS_PER_ROUND - chipsUsed,
    isSettled: !!settlement,
  }
}

// ─── Ranking de apuestas de una temporada ──────────────────────────
// Única fuente para "cómo va el ranking de apuestas de esta liga": la
// usan Liga → Apuestas → Clasificación Y la zona de saldo/ranking de
// Inicio (antes cada uno calculaba algo distinto — uno all-time, otro
// por temporada — a partir de las mismas filas de betting_round_results).
export type SeasonBettingRankingRow = {
  player_id: string
  name: string
  points: number
  firsts: number
  seconds: number
  correct_picks: number
  markets_bet: number
  accuracy_pct: number
  total_bet: number
  total_prizes: number
  best_round_chips: number
  biggest_single_prize: number
  jackpots_won: number
}

export async function getSeasonBettingRanking(supabase: SupabaseClient, seasonId: string): Promise<SeasonBettingRankingRow[]> {
  const { data } = await supabase
    .from('betting_leaderboard')
    .select('*')
    .eq('season_id', seasonId)
    .order('points', { ascending: false })
    .order('best_round_chips', { ascending: false })

  return (data ?? []) as SeasonBettingRankingRow[]
}

// Fichas restantes de un jugador en la jornada activa más próxima de
// la temporada (para la zona de saldo de Inicio). Devuelve null si no
// hay jornada con apuestas abiertas.
export async function getActiveRoundChipsLeft(supabase: SupabaseClient, seasonId: string, userId: string): Promise<{ roundId: string; roundNumber: number; chipsLeft: number; openMarketsCount: number } | null> {
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, round_number, scheduled_date, scheduled_time, status')
    .eq('season_id', seasonId)
    .eq('status', 'scheduled')
    .order('round_number', { ascending: true })

  for (const round of rounds ?? []) {
    const ctx = await getRoundBettingContext(supabase, round.id, userId)
    if (ctx.openMarketsCount > 0) {
      return { roundId: round.id, roundNumber: round.round_number, chipsLeft: ctx.chipsLeft, openMarketsCount: ctx.openMarketsCount }
    }
  }
  return null
}
