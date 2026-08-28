import type { SupabaseClient } from '@supabase/supabase-js'
import { computeCompetitiveDna, computeBestPartner, type DnaAxes, type PlayerMatchRecord } from '@/lib/dna'

export type PlayerDna = {
  playerId: string
  playerName: string
  axes: DnaAxes
  bestPartner: { partnerId: string; partnerName: string; winPct: number; matchesTogether: number } | null
}

type MatchRow = {
  winner: 'team1' | 'team2' | 'draw' | null
  set1_t1: number | null; set1_t2: number | null
  set2_t1: number | null; set2_t2: number | null
  set3_t1: number | null; set3_t2: number | null
  team1_p1_id: string; team1_p2_id: string
  team2_p1_id: string; team2_p2_id: string
} | null

function countSetsWon(m: NonNullable<MatchRow>, team: 1 | 2): number {
  const sets: [number | null, number | null][] = [[m.set1_t1, m.set1_t2], [m.set2_t1, m.set2_t2], [m.set3_t1, m.set3_t2]]
  let won = 0
  for (const [t1, t2] of sets) {
    if (t1 === null || t2 === null) continue
    if (team === 1 ? t1 > t2 : t2 > t1) won++
  }
  return won
}

// El ADN competitivo de los 4 jugadores de la temporada, calculado de
// una sola pasada (una consulta de partidos + una de apuestas) para
// que el selector "Comparar con" del perfil pueda cambiar de jugador
// sin volver a pedir nada al servidor.
export async function getSeasonCompetitiveDna(supabase: SupabaseClient, seasonId: string): Promise<PlayerDna[]> {
  const [{ data: players }, { data: rounds }] = await Promise.all([
    supabase.from('profiles').select('id, name').order('created_at'),
    supabase.from('rounds')
      .select('id, round_number, match:matches(winner, set1_t1, set1_t2, set2_t1, set2_t2, set3_t1, set3_t2, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id)')
      .eq('season_id', seasonId)
      .order('round_number', { ascending: false }),
  ])

  const playerList = players ?? []
  const playerIds = playerList.map(p => p.id)

  const perPlayerMatches: Record<string, PlayerMatchRecord[]> = {}
  for (const id of playerIds) perPlayerMatches[id] = []

  const roundIds: string[] = []
  for (const r of rounds ?? []) {
    roundIds.push(r.id)
    const m = r.match as unknown as MatchRow
    if (!m || !m.winner || m.winner === 'draw') continue

    const setsPlayed: 2 | 3 = m.set3_t1 !== null ? 3 : 2
    const team1Sets = countSetsWon(m, 1)
    const team2Sets = countSetsWon(m, 2)
    const team1 = [m.team1_p1_id, m.team1_p2_id]
    const team2 = [m.team2_p1_id, m.team2_p2_id]

    for (const pid of team1) {
      perPlayerMatches[pid]?.push({
        roundNumber: r.round_number, won: m.winner === 'team1',
        setsWon: team1Sets, setsLost: team2Sets, setsPlayed,
        partnerId: team1.find(x => x !== pid)!,
      })
    }
    for (const pid of team2) {
      perPlayerMatches[pid]?.push({
        roundNumber: r.round_number, won: m.winner === 'team2',
        setsWon: team2Sets, setsLost: team1Sets, setsPlayed,
        partnerId: team2.find(x => x !== pid)!,
      })
    }
  }

  const { data: bettingRows } = roundIds.length
    ? await supabase.from('betting_round_results').select('player_id, correct_count, markets_bet_count, chips_net').in('round_id', roundIds)
    : { data: [] as { player_id: string; correct_count: number; markets_bet_count: number; chips_net: number }[] }

  const bettingAgg: Record<string, { correct: number; bet: number; net: number }> = {}
  for (const id of playerIds) bettingAgg[id] = { correct: 0, bet: 0, net: 0 }
  for (const row of bettingRows ?? []) {
    const agg = bettingAgg[row.player_id]
    if (!agg) continue
    agg.correct += row.correct_count ?? 0
    agg.bet += row.markets_bet_count ?? 0
    agg.net += row.chips_net ?? 0
  }
  const leagueChipsNetTotals = playerIds.map(id => bettingAgg[id].net)

  const nameById = new Map(playerList.map(p => [p.id, p.name]))

  return playerList.map(p => {
    const matches = perPlayerMatches[p.id] ?? []
    const bestPartner = computeBestPartner(matches)
    return {
      playerId: p.id,
      playerName: p.name,
      axes: computeCompetitiveDna({
        matches,
        matchesDesc: matches, // las rondas ya vienen ordenadas de más reciente a más antigua
        possiblePartners: Math.max(0, playerIds.length - 1),
        correctCount: bettingAgg[p.id]?.correct ?? 0,
        marketsBet: bettingAgg[p.id]?.bet ?? 0,
        chipsNet: bettingAgg[p.id]?.net ?? 0,
        leagueChipsNetTotals,
      }),
      bestPartner: bestPartner ? {
        partnerId: bestPartner.partnerId,
        partnerName: nameById.get(bestPartner.partnerId) ?? '?',
        winPct: bestPartner.winPct,
        matchesTogether: bestPartner.matchesTogether,
      } : null,
    }
  })
}
