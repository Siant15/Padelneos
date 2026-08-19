export type Profile = {
  id: string
  name: string
  avatar_url: string | null
  created_at: string
}

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
