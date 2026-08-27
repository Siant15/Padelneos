import type { SupabaseClient } from '@supabase/supabase-js'
import { CHIPS_PER_ROUND, isMarketOpenForBetting } from '@/lib/betting'
import type { BettingMarket, Match } from '@/lib/types'
import { getPairName } from '@/lib/types'

// "2-1" (sets ganados por cada pareja), no el marcador literal set a
// set — es el formato pedido para la cabecera de la jornada en el acta.
function setsWonLabel(match: Match): string | null {
  if (match.set1_t1 === null) return null
  const sets: [number | null, number | null][] = [[match.set1_t1, match.set1_t2], [match.set2_t1, match.set2_t2], [match.set3_t1, match.set3_t2]]
  let t1 = 0, t2 = 0
  for (const [a, b] of sets) {
    if (a === null || b === null) continue
    if (a > b) t1++
    else if (b > a) t2++
  }
  return `${t1}-${t2}`
}

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

// ─── "Acta" de una jornada liquidada ────────────────────────────────
// Vista de solo lectura para Liga → Apuestas: quién apostó qué, quién
// acertó y cuánto ganó, pregunta por pregunta. Los importes de premio
// vienen de market_settlement_entries (escritos por settle_round en
// el momento del reparto real) — nunca se recalculan aquí, para no
// duplicar la lógica de reparto pari-mutuel.
export type ActaBetRow = {
  playerId: string
  playerName: string
  pronostico: string | null
  chips: number | null
  prize: number | null
  isWinner: boolean
}

export type ActaMarket = {
  id: string
  description: string
  showPronostico: boolean
  resolved: boolean
  voided: boolean
  winningLabel: string | null
  hasNoWinners: boolean
  rows: ActaBetRow[]
}

// Cierre de la jornada: una fila por jugador con lo apostado/recibido y
// los puntos de la jornada — viene tal cual de betting_round_results
// (escrita por settle_round), sin volver a calcular el ranking aquí.
export type ActaClosureRow = {
  playerId: string
  playerName: string
  rank: number
  chipsBet: number
  chipsReceived: number
  points: number
  correctCount: number
}

export type RoundActa = {
  round: { id: string; roundNumber: number; status: string; scheduledDate: string | null; scheduledTime: string | null; club: string | null } | null
  pair1Label: string | null
  pair2Label: string | null
  scoreLabel: string | null
  isSettled: boolean
  markets: ActaMarket[]
  closure: ActaClosureRow[]
}

// `preloadedPlayers` evita repetir la consulta a `profiles` (siempre la
// misma lista para toda la temporada) cuando el llamador ya la tiene —
// relevante porque Liga → Apuestas llama a esta función una vez por
// cada jornada liquidada.
export async function getRoundActa(supabase: SupabaseClient, roundId: string, preloadedPlayers?: { id: string; name: string }[]): Promise<RoundActa> {
  const [{ data: round }, { data: markets }, { data: settlement }, { data: entries }, { data: results }, playersResult] = await Promise.all([
    supabase.from('rounds')
      .select(`id, round_number, scheduled_date, scheduled_time, club, status, match:matches(
        id, set1_t1, set1_t2, set2_t1, set2_t2, set3_t1, set3_t2, winner,
        team1_p1:profiles!team1_p1_id(id, name), team1_p2:profiles!team1_p2_id(id, name),
        team2_p1:profiles!team2_p1_id(id, name), team2_p2:profiles!team2_p2_id(id, name)
      )`)
      .eq('id', roundId).maybeSingle(),
    supabase.from('betting_markets')
      .select('*, options:betting_options!market_id(*), bets(*)')
      .eq('round_id', roundId)
      .order('created_at'),
    supabase.from('round_settlements').select('id').eq('round_id', roundId).is('voided_at', null).maybeSingle(),
    supabase.from('market_settlement_entries').select('*').eq('round_id', roundId),
    supabase.from('betting_round_results').select('*, player:profiles(id, name)').eq('round_id', roundId).order('rank'),
    preloadedPlayers ? Promise.resolve({ data: preloadedPlayers }) : supabase.from('profiles').select('id, name').order('created_at'),
  ])
  const players = playersResult.data

  if (!round) {
    return { round: null, pair1Label: null, pair2Label: null, scoreLabel: null, isSettled: false, markets: [], closure: [] }
  }

  const match = round.match as unknown as (Match & { team1_p1: { name: string }; team1_p2: { name: string }; team2_p1: { name: string }; team2_p2: { name: string } }) | null
  const isSettled = !!settlement
  const marketList = (markets as BettingMarket[] | null) ?? []
  const entryList = entries ?? []
  const playerList = players ?? []

  const actaMarkets: ActaMarket[] = marketList.map(market => {
    const options = market.options ?? []
    const optionLabel = (optionId: string) => options.find(o => o.id === optionId)?.label ?? '?'
    const marketEntries = entryList.filter(e => e.market_id === market.id)
    const winningLabel = !market.voided && market.winning_option_id ? optionLabel(market.winning_option_id) : null
    const hasNoWinners = !market.voided && market.resolved && marketEntries.length > 0 && !marketEntries.some(e => e.is_winner)

    const rows: ActaBetRow[] = playerList.map(p => {
      const playerBets = (market.bets ?? []).filter(b => b.player_id === p.id)
      const entry = marketEntries.find(e => e.player_id === p.id)
      return {
        playerId: p.id,
        playerName: p.name,
        pronostico: playerBets.length ? playerBets.map(b => optionLabel(b.option_id)).join(' + ') : null,
        chips: playerBets.length ? playerBets.reduce((s, b) => s + b.chips, 0) : null,
        prize: isSettled && entry ? entry.chips_prize : null,
        isWinner: entry?.is_winner ?? false,
      }
    }).filter(r => r.chips !== null)

    return {
      id: market.id,
      description: market.description,
      showPronostico: options.length > 2,
      resolved: market.resolved,
      voided: market.voided,
      winningLabel,
      hasNoWinners,
      rows,
    }
  })

  const closure: ActaClosureRow[] = (results ?? [])
    .map(r => ({
      playerId: r.player_id,
      playerName: (r.player as { name: string } | null)?.name ?? '?',
      rank: r.rank,
      chipsBet: r.chips_bet,
      chipsReceived: r.chips_won,
      points: r.point_bonus,
      correctCount: r.correct_count,
    }))
    .sort((a, b) => a.rank - b.rank)

  return {
    round: {
      id: round.id,
      roundNumber: round.round_number,
      status: round.status,
      scheduledDate: round.scheduled_date,
      scheduledTime: round.scheduled_time,
      club: round.club,
    },
    pair1Label: match ? getPairName(match as Match, 'team1') : null,
    pair2Label: match ? getPairName(match as Match, 'team2') : null,
    scoreLabel: match ? setsWonLabel(match as Match) : null,
    isSettled,
    markets: actaMarkets,
    closure,
  }
}
