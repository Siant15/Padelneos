export type Profile = {
  id: string
  name: string
  avatar_url: string | null
  racket_brand: string | null
  dominant_hand: 'diestra' | 'zurda' | null
  preferred_side: 'drive' | 'reves' | null
  created_at: string
}

export const HAND_LABELS: Record<string, string> = { diestra: 'Diestra', zurda: 'Zurda' }
export const SIDE_LABELS: Record<string, string> = { drive: 'Drive (derecha)', reves: 'Revés (izquierda)' }

export type Season = {
  id: string
  name: string
  start_date: string
  end_date: string | null
  day_of_week: number | null
  match_time: string | null
  default_club: string | null
  min_matches: number
  status: 'active' | 'finished'
  created_at: string
}

export type Round = {
  id: string
  season_id: string
  round_number: number
  scheduled_date: string | null
  scheduled_time: string | null
  club: string | null
  status: 'scheduled' | 'played' | 'cancelled'
  court_booker_id: string | null
  court_confirmed: boolean
  created_at: string
  court_booker?: Profile
  match?: Match
}

export type Match = {
  id: string
  round_id: string
  team1_p1_id: string
  team1_p2_id: string
  team2_p1_id: string
  team2_p2_id: string
  set1_t1: number | null
  set1_t2: number | null
  set2_t1: number | null
  set2_t2: number | null
  set3_t1: number | null
  set3_t2: number | null
  winner: 'team1' | 'team2' | 'draw' | null
  played_at: string | null
  created_at: string
  team1_p1?: Profile
  team1_p2?: Profile
  team2_p1?: Profile
  team2_p2?: Profile
}

export type MatchStat = {
  id: string
  match_id: string
  player_id: string
  aces: number
  double_faults: number
  bolas_por_3: number
  smash_al_cristal: number
  created_at: string
  player?: Profile
}

export type BettingAnswerType = 'pair' | 'player' | 'yes_no' | 'sets_score' | 'exact_score' | 'custom_options'
export type BettingCategory = 'automatic' | 'anecdotal'
export type ResolutionKey = 'match_winner' | 'set1_winner' | 'set2_winner' | 'set3_winner' | 'third_set' | 'tiebreak' | 'comeback' | 'sets_score' | 'exact_score'

export type BettingQuestionTemplate = {
  id: string
  text: string
  category: BettingCategory
  answer_type: BettingAnswerType
  resolution_key: ResolutionKey | null
  options: { label: string; value: string }[] | null
  allow_none: boolean
  auto_apply: boolean
  active: boolean
  created_at: string
  created_by: string | null
}

export type BettingMarket = {
  id: string
  round_id: string
  // 'player_choice' y 'quantity' son valores heredados de jornadas
  // creadas antes de las plantillas — se conservan por compatibilidad.
  type: BettingAnswerType | 'player_choice' | 'quantity'
  description: string
  quantity_threshold: number | null
  closes_at: string | null
  resolved: boolean
  voided: boolean
  winning_option_id: string | null
  template_id: string | null
  season_id: string | null
  created_at: string
  options?: BettingOption[]
  bets?: Bet[]
  template?: BettingQuestionTemplate
}

export type BettingOption = {
  id: string
  market_id: string
  label: string
  player_id: string | null
  value: string | null
  is_self_negative: boolean
  is_none: boolean
  created_at: string
  player?: Profile
}

export type Bet = {
  id: string
  market_id: string
  option_id: string
  player_id: string
  chips: number
  created_at: string
}

export type BettingRoundResult = {
  id: string
  round_id: string
  player_id: string
  opening_chips: number
  chips_bet: number
  chips_net: number
  chips_final: number
  chips_won: number
  correct_count: number
  markets_bet_count: number
  point_bonus: number
  rank: number
  created_at: string
  player?: Profile
}

export type Jackpot = {
  id: string
  template_id: string
  season_id: string
  chips: number
  updated_at: string
}

export type IndividualStanding = {
  season_id: string
  player_id: string
  name: string
  matches_played: number
  wins: number
  draws: number
  losses: number
  sport_points: number
  betting_bonus: number
  total_points: number
}

export type PairStanding = {
  season_id: string
  pair_key: string
  p1_id: string
  p1_name: string
  p2_id: string
  p2_name: string
  matches_played: number
  wins: number
  draws: number
  losses: number
  points: number
}

// Riesgo de acabar 3º/4º (quien paga la cena al terminar la liga): en
// vez de un % fijo por puesto actual, se simulan TODAS las combinaciones
// de resultados de las jornadas que quedan (ya se conocen las parejas de
// cada una) y se cuenta en cuántas cada jugador termina en el fondo de
// la tabla. Misma regla de puntos que individual_standings (victoria=2,
// derrota=0 por jugador; el bonus de apuestas ya acumulado se mantiene
// fijo, porque las apuestas futuras no se pueden predecir) — para que la
// simulación no contradiga la clasificación real que ya se muestra.
export type DinnerRiskTier = { level: 1 | 2 | 3 | 4; label: string; emoji: string; colorVar: string; probability: number }

export const DINNER_RISK_TIERS: Omit<DinnerRiskTier, 'probability'>[] = [
  { level: 1, label: 'Tranquilo', emoji: '😌', colorVar: 'var(--heat-low)' },
  { level: 2, label: 'Vigilando', emoji: '👀', colorVar: 'var(--heat-mid)' },
  { level: 3, label: 'En peligro', emoji: '😬', colorVar: 'var(--heat-high)' },
  { level: 4, label: 'Va a pagar la cena', emoji: '🍽️', colorVar: 'var(--heat-max)' },
]

function dinnerRiskTierFor(probability: number): DinnerRiskTier {
  const tier = probability < 0.15 ? DINNER_RISK_TIERS[0]
    : probability < 0.4 ? DINNER_RISK_TIERS[1]
    : probability < 0.65 ? DINNER_RISK_TIERS[2]
    : DINNER_RISK_TIERS[3]
  return { ...tier, probability }
}

export function estimateDinnerRisk(
  players: { id: string; sportPoints: number; bettingBonus: number }[],
  remainingPairings: { pair1: [string, string]; pair2: [string, string] }[]
): Record<string, DinnerRiskTier> {
  // Tope defensivo: 2^n combinaciones se vuelve inviable con muchas
  // jornadas por jugar. No pasa en esta liga (9-12 jornadas de por sí),
  // pero si alguna vez hubiera más, se simulan solo las siguientes 20.
  const n = Math.min(remainingPairings.length, 20)
  const totalCombos = 2 ** n
  const bottomCount: Record<string, number> = {}
  for (const p of players) bottomCount[p.id] = 0

  for (let mask = 0; mask < totalCombos; mask++) {
    const sport: Record<string, number> = {}
    for (const p of players) sport[p.id] = p.sportPoints

    for (let i = 0; i < n; i++) {
      const { pair1, pair2 } = remainingPairings[i]
      const pair1Wins = ((mask >> i) & 1) === 0
      for (const id of pair1Wins ? pair1 : pair2) sport[id] = (sport[id] ?? 0) + 2
    }

    const ranked = players
      .map(p => ({ id: p.id, total: sport[p.id] + p.bettingBonus, sport: sport[p.id] }))
      .sort((a, b) => b.total - a.total || b.sport - a.sport || a.id.localeCompare(b.id))

    for (const bottom of ranked.slice(2)) bottomCount[bottom.id]++
  }

  const result: Record<string, DinnerRiskTier> = {}
  for (const p of players) result[p.id] = dinnerRiskTierFor(bottomCount[p.id] / totalCombos)
  return result
}

export const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

// Marcador válido de un set de pádel: 6-0..6-4, 7-5 o 7-6 (con tie-break).
export function isValidSetScore(a: number, b: number): boolean {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  if (hi === 6 && lo <= 4) return true
  if (hi === 7 && (lo === 5 || lo === 6)) return true
  return false
}

export function getMatchScore(match: Match): string {
  if (!match.set1_t1 && match.set1_t1 !== 0) return '-'
  const sets = [
    `${match.set1_t1}-${match.set1_t2}`,
    `${match.set2_t1}-${match.set2_t2}`,
  ]
  if (match.set3_t1 !== null) sets.push(`${match.set3_t1}-${match.set3_t2}`)
  return sets.join(' / ')
}

export function getPairName(match: Match, team: 'team1' | 'team2'): string {
  if (team === 'team1') {
    return `${match.team1_p1?.name ?? '?'} & ${match.team1_p2?.name ?? '?'}`
  }
  return `${match.team2_p1?.name ?? '?'} & ${match.team2_p2?.name ?? '?'}`
}

// Estado de una jornada, calculado a partir de si tiene día+hora+club
// y de si ya se ha jugado — nunca se elige a mano.
export type JornadaReservaStatus = 'pendiente' | 'reservada' | 'finalizada'

export function getJornadaReservaStatus(round: { scheduled_date: string | null; scheduled_time: string | null; club: string | null; status: string }): JornadaReservaStatus {
  if (round.status === 'played') return 'finalizada'
  if (round.scheduled_date && round.scheduled_time && round.club) return 'reservada'
  return 'pendiente'
}
