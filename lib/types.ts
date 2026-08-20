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
  min_matches: number
  status: 'active' | 'finished'
  created_at: string
}

export type Round = {
  id: string
  season_id: string
  round_number: number
  scheduled_date: string
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

export type BettingMarket = {
  id: string
  round_id: string
  type: 'yes_no' | 'player_choice' | 'quantity'
  description: string
  quantity_threshold: number | null
  closes_at: string | null
  resolved: boolean
  winning_option_id: string | null
  created_at: string
  options?: BettingOption[]
  bets?: Bet[]
}

export type BettingOption = {
  id: string
  market_id: string
  label: string
  player_id: string | null
  value: string | null
  is_self_negative: boolean
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
  chips_net: number
  chips_total: number
  point_bonus: number
  rank: number
  created_at: string
  player?: Profile
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

export const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
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

// ─── Calendario de temporada ───────────────────────────────────
// Las ligas duran 3 meses (12 semanas) con 9 partidos, 1 por semana:
// se juegan 3 semanas seguidas y se descansa 1, repitiendo el patrón
// (semanas 4, 8 y 12 son descanso). Con matchIndex 1-9 devuelve en
// qué semana (1-12) cae ese partido.
export function getSeasonMatchWeek(matchIndex: number): number {
  const n = matchIndex - 1
  return Math.floor(n / 3) * 4 + (n % 3) + 1
}

export function getSeasonMatchDate(startDate: string, matchIndex: number): string {
  const week = getSeasonMatchWeek(matchIndex)
  const d = new Date(startDate + 'T12:00:00')
  d.setDate(d.getDate() + (week - 1) * 7)
  return d.toISOString().slice(0, 10)
}

export type SeasonCalendarWeek = { week: number; date: string; matchIndex: number | null }

export function getSeasonCalendar(startDate: string, totalMatches = 9): SeasonCalendarWeek[] {
  const totalWeeks = Math.ceil(totalMatches / 3) * 4
  const matchWeeks = new Map<number, number>()
  for (let i = 1; i <= totalMatches; i++) matchWeeks.set(getSeasonMatchWeek(i), i)

  const weeks: SeasonCalendarWeek[] = []
  for (let week = 1; week <= totalWeeks; week++) {
    const d = new Date(startDate + 'T12:00:00')
    d.setDate(d.getDate() + (week - 1) * 7)
    weeks.push({ week, date: d.toISOString().slice(0, 10), matchIndex: matchWeeks.get(week) ?? null })
  }
  return weeks
}
