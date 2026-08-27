import { getCachedPlayers, getCachedSeasonRounds, getCachedSeasonAggregates, getCachedSeasonBettingRanking } from '@/lib/supabase/cached'
import { computeStandingsRows, computeHeadToHead, computePiques, type RoundWithMatch, type Pique, type PlayerRow } from '@/lib/piques'

export async function getInicioData(seasonId: string): Promise<{ rows: PlayerRow[]; piques: Pique[] }> {
  const [players, rounds] = await Promise.all([getCachedPlayers(), getCachedSeasonRounds(seasonId)])
  const matchIds = rounds.map(r => (r.match as { id: string } | null)?.id).filter(Boolean) as string[]
  const roundIds = rounds.map(r => r.id)

  const [{ allBetResults }, bettingRanking] = await Promise.all([
    getCachedSeasonAggregates(seasonId, matchIds, roundIds),
    getCachedSeasonBettingRanking(seasonId),
  ])

  const roundsForPiques = rounds as unknown as RoundWithMatch[]
  const rows = computeStandingsRows(players, roundsForPiques, allBetResults)
  const headToHead = computeHeadToHead(roundsForPiques)

  const bettingTop = bettingRanking[0]
    ? { name: bettingRanking[0].name, correctPicks: bettingRanking[0].correct_picks }
    : null

  const piques = computePiques(rows, headToHead, bettingTop)
  return { rows, piques }
}
