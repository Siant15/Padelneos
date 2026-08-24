import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedPlayers, getCachedSeasonRounds, getCachedSeasonAggregates } from '@/lib/supabase/cached'
import { getSeasonBettingRanking } from '@/lib/betting-queries'
import { computeStandingsRows, computeHeadToHead, computePiques, type RoundWithMatch, type Pique, type PlayerRow } from '@/lib/piques'

export async function getInicioData(supabase: SupabaseClient, seasonId: string): Promise<{ rows: PlayerRow[]; piques: Pique[] }> {
  const players = await getCachedPlayers()
  const rounds = await getCachedSeasonRounds(seasonId)
  const matchIds = rounds.map(r => (r.match as { id: string } | null)?.id).filter(Boolean) as string[]
  const roundIds = rounds.map(r => r.id)

  const [{ allBetResults }, bettingRanking] = await Promise.all([
    getCachedSeasonAggregates(seasonId, matchIds, roundIds),
    getSeasonBettingRanking(supabase, seasonId),
  ])

  const roundsForPiques = rounds as unknown as RoundWithMatch[]
  const rows = computeStandingsRows(players, roundsForPiques, allBetResults)
  const headToHead = computeHeadToHead(roundsForPiques)

  const nextRound = rounds.find(r => r.status === 'scheduled')
  const nextMatch = nextRound?.match as { team1_p1?: { id: string }; team1_p2?: { id: string }; team2_p1?: { id: string }; team2_p2?: { id: string } } | null
  const nextPairing = nextMatch?.team1_p1?.id && nextMatch.team1_p2?.id && nextMatch.team2_p1?.id && nextMatch.team2_p2?.id
    ? { team1: [nextMatch.team1_p1.id, nextMatch.team1_p2.id], team2: [nextMatch.team2_p1.id, nextMatch.team2_p2.id] }
    : null

  const bettingTop = bettingRanking[0]
    ? { name: bettingRanking[0].name, correctPicks: bettingRanking[0].correct_picks, points: bettingRanking[0].points }
    : null

  const piques = computePiques(rows, headToHead, nextPairing, bettingTop)
  return { rows, piques }
}
