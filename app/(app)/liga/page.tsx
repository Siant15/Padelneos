import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { BettingRoundResult, IndividualStanding, PairStanding, Profile } from '@/lib/types'
import { formatDate } from '@/lib/types'
import LigaTabs from '@/components/LigaTabs'
import type { JornadaViewModel } from '@/components/JornadasAccordion'

const MEDALS = ['🥇', '🥈', '🥉', '4º']

export default async function LigaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: activeSeasonRow } = await supabase
    .from('seasons')
    .select('id, match_time')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const seasonId = activeSeasonRow?.id

  // ─── Calendario ───────────────────────────────────────────
  const { data: rounds } = await supabase
    .from('rounds')
    .select(`
      *,
      court_booker:profiles!court_booker_id(id, name),
      match:matches(
        id, winner, set1_t1, set1_t2, set2_t1, set2_t2, set3_t1, set3_t2,
        team1_p1:profiles!team1_p1_id(id, name),
        team1_p2:profiles!team1_p2_id(id, name),
        team2_p1:profiles!team2_p1_id(id, name),
        team2_p2:profiles!team2_p2_id(id, name)
      )
    `)
    .order('scheduled_date', { ascending: true })

  const matchIds = (rounds ?? [])
    .map(r => (r.match as { id: string } | null)?.id)
    .filter(Boolean) as string[]
  const roundIds = (rounds ?? []).map(r => r.id)

  const [{ data: allStats }, { data: allBetResults }] = await Promise.all([
    matchIds.length
      ? supabase.from('match_stats').select('*, player:profiles(id, name)').in('match_id', matchIds)
      : Promise.resolve({ data: [] }),
    roundIds.length
      ? supabase.from('betting_round_results').select('*, player:profiles(id, name)').in('round_id', roundIds).order('rank')
      : Promise.resolve({ data: [] }),
  ])

  const nextRound = (rounds ?? []).find(r => r.status !== 'played')

  const calendarioItems: JornadaViewModel[] = (rounds ?? []).map(round => {
    const match = round.match as {
      id: string; winner: string | null
      set1_t1: number | null; set1_t2: number | null; set2_t1: number | null; set2_t2: number | null; set3_t1: number | null; set3_t2: number | null
      team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string }
    } | null

    const stats = (allStats ?? [])
      .filter((s: { match_id: string }) => s.match_id === match?.id)
      .map((s: { aces: number; double_faults: number; bolas_por_3: number; smash_al_cristal: number; player?: { name: string } }) => ({
        name: s.player?.name ?? '',
        line: `${s.aces} aces · ${s.double_faults} df · ${s.bolas_por_3} bolas3 · ${s.smash_al_cristal} cristal`,
      }))

    const betResults = (allBetResults ?? []).filter((b: { round_id: string }) => b.round_id === round.id)
    const betWinner = betResults.find((b: { rank: number }) => b.rank === 1)
    const betSecond = betResults.find((b: { rank: number }) => b.rank === 2)

    const isNext = nextRound?.id === round.id
    const played = round.status === 'played'
    const effectiveTime = (round.scheduled_time ?? activeSeasonRow?.match_time)?.slice(0, 5) ?? ''

    let scoreLabel = ''
    if (match && match.set1_t1 !== null) {
      const sets = [`${match.set1_t1}-${match.set1_t2}`, `${match.set2_t1}-${match.set2_t2}`]
      if (match.set3_t1 !== null) sets.push(`${match.set3_t1}-${match.set3_t2}`)
      scoreLabel = sets.join(', ')
    }

    return {
      id: round.id,
      numLabel: String(round.round_number),
      dateLabel: formatDate(round.scheduled_date),
      timeLabel: effectiveTime,
      hasCustomTime: !!round.scheduled_time,
      pairALabel: match ? `${match.team1_p1?.name ?? '?'} / ${match.team1_p2?.name ?? '?'}` : 'Por confirmar',
      pairBLabel: match ? `${match.team2_p1?.name ?? '?'} / ${match.team2_p2?.name ?? '?'}` : '',
      responsableName: round.court_booker?.name ?? 'Sin asignar',
      reservaConfirmed: round.court_confirmed,
      played,
      isNext,
      statusLabel: played ? '✔ Jugada' : (isNext ? '⏳ Próxima' : '📅 Programada'),
      tagBg: played ? 'var(--green-bg)' : (isNext ? 'var(--orange-bg)' : 'var(--tint)'),
      tagColor: played ? 'var(--green)' : (isNext ? 'var(--orange)' : 'var(--text-muted2)'),
      scoreLabel,
      winnerLabel: match?.winner === 'team1'
        ? `${match.team1_p1?.name} / ${match.team1_p2?.name}`
        : match?.winner === 'team2'
          ? `${match.team2_p1?.name} / ${match.team2_p2?.name}`
          : '',
      stats,
      betWinner: betWinner?.player?.name ?? '',
      betSecond: betSecond?.player?.name ?? '',
    }
  })

  // ─── Clasificación ────────────────────────────────────────
  const { data: seasonRoundsForResults } = seasonId
    ? await supabase.from('rounds').select('id').eq('season_id', seasonId)
    : { data: [] as { id: string }[] }
  const seasonRoundIds = (seasonRoundsForResults ?? []).map(r => r.id)

  const [{ data: individual }, { data: pairs }, { data: betResultsForSeason }] = await Promise.all([
    seasonId
      ? supabase.from('individual_standings').select('*').eq('season_id', seasonId).order('total_points', { ascending: false }).order('sport_points', { ascending: false })
      : Promise.resolve({ data: [] as IndividualStanding[] }),
    seasonId
      ? supabase.from('pair_standings').select('*').eq('season_id', seasonId).order('points', { ascending: false }).order('wins', { ascending: false })
      : Promise.resolve({ data: [] as PairStanding[] }),
    seasonRoundIds.length
      ? supabase.from('betting_round_results').select('*, player:profiles(id, name)').in('round_id', seasonRoundIds)
      : Promise.resolve({ data: [] as BettingRoundResult[] }),
  ])

  const individualRows = ((individual as IndividualStanding[] | null) ?? []).map((s, i) => ({
    medal: MEDALS[i] ?? `${i + 1}º`,
    name: s.name,
    pj: s.matches_played,
    deportivo: s.sport_points,
    apuestas: s.betting_bonus,
    total: s.total_points,
  }))

  const pairRows = ((pairs as PairStanding[] | null) ?? []).map(p => ({
    name: `${p.p1_name} / ${p.p2_name}`,
    pj: p.matches_played,
    pg: p.wins,
    pts: p.points,
  }))

  const betTotalsForSeason: Record<string, { name: string; wins: number; pts: number }> = {}
  for (const r of (betResultsForSeason as BettingRoundResult[] | null) ?? []) {
    const name = (r.player as Profile)?.name ?? '?'
    if (!betTotalsForSeason[r.player_id]) betTotalsForSeason[r.player_id] = { name, wins: 0, pts: 0 }
    if (r.rank === 1) betTotalsForSeason[r.player_id].wins++
    betTotalsForSeason[r.player_id].pts += r.point_bonus
  }
  const clasificacionApuestasRows = Object.values(betTotalsForSeason)
    .sort((a, b) => b.pts - a.pts)
    .map((r, i) => ({ medal: MEDALS[i] ?? `${i + 1}º`, name: r.name, wins: r.wins, pts: r.pts }))

  // ─── Apuestas (índice) ────────────────────────────────────
  const { data: players } = await supabase.from('profiles').select('id, name')

  const { data: allResults } = await supabase
    .from('betting_round_results')
    .select('*, player:profiles(id, name)')

  type BettingTotal = { player_id: string; name: string; chips_total: number; total_bonus: number; rounds: number }
  const bettingTotals: Record<string, BettingTotal> = {}
  for (const r of (allResults as BettingRoundResult[] | null) ?? []) {
    if (!bettingTotals[r.player_id]) {
      bettingTotals[r.player_id] = { player_id: r.player_id, name: (r.player as Profile)?.name ?? '?', chips_total: 0, total_bonus: 0, rounds: 0 }
    }
    bettingTotals[r.player_id].chips_total += r.chips_net
    bettingTotals[r.player_id].total_bonus += r.point_bonus
    bettingTotals[r.player_id].rounds++
  }
  const bettingRanking = Object.values(bettingTotals).sort((a, b) => b.chips_total - a.chips_total)

  const { data: resultsChrono } = await supabase
    .from('betting_round_results')
    .select('player_id, rank, player:profiles(id, name), round:rounds(scheduled_date)')
    .order('scheduled_date', { referencedTable: 'round', ascending: true })

  let nostradamus: { name: string; count: number } | null = null
  for (const p of (players as { id: string; name: string }[] | null) ?? []) {
    let streak = 0
    for (const r of (resultsChrono as { player_id: string; rank: number }[] | null) ?? []) {
      if (r.player_id !== p.id) continue
      if (r.rank === 1) streak++
      else streak = 0
    }
    if (streak >= 2 && (!nostradamus || streak > nostradamus.count)) {
      nostradamus = { name: p.name, count: streak }
    }
  }

  const { data: biggestBet } = await supabase
    .from('bets')
    .select('chips, player:profiles(name), option:betting_options(id, label, market:betting_markets(winning_option_id, resolved))')
    .order('chips', { ascending: false })
    .limit(1)
    .maybeSingle()

  type BiggestBet = { chips: number; player: { name: string } | null; option: { id: string; label: string; market: { winning_option_id: string | null; resolved: boolean } | null } | null }
  const bb = biggestBet as BiggestBet | null
  const biggestBetWon = bb?.option?.market?.resolved ? bb.option.id === bb.option.market.winning_option_id : null

  const { data: apuestasRounds } = await supabase
    .from('rounds')
    .select('id, round_number, scheduled_date, status')
    .order('scheduled_date', { ascending: false })
    .limit(10)

  const apuestasRoundIds = (apuestasRounds ?? []).map(r => r.id)
  const { data: marketsByRound } = apuestasRoundIds.length
    ? await supabase.from('betting_markets').select('round_id, resolved').in('round_id', apuestasRoundIds)
    : { data: [] as { round_id: string; resolved: boolean }[] }

  const apuestasRoundsView = (apuestasRounds ?? []).map(r => {
    const marketsForRound = (marketsByRound ?? []).filter(m => m.round_id === r.id)
    const status = !marketsForRound.length
      ? { label: 'Sin mercados aún', color: 'var(--text-muted2)' }
      : marketsForRound.every(m => m.resolved)
        ? { label: 'Resuelta', color: 'var(--green)' }
        : { label: 'Activa', color: 'var(--orange)' }
    return { id: r.id, roundNumber: r.round_number, statusLabel: status.label, statusColor: status.color }
  })

  return (
    <div className="px-5 pt-5 pb-6">
      <h1 className="font-heading text-[22px] font-extrabold mb-4">🎾 Liga</h1>
      <Suspense fallback={null}>
        <LigaTabs
          calendarioItems={calendarioItems}
          clasificacionIndividual={individualRows}
          clasificacionParejas={pairRows}
          clasificacionApuestas={clasificacionApuestasRows}
          apuestasRanking={bettingRanking}
          apuestasNostradamus={nostradamus}
          apuestasBiggestBet={bb ? { playerName: bb.player?.name ?? '?', chips: bb.chips, optionLabel: bb.option?.label ?? '', won: biggestBetWon } : null}
          apuestasRounds={apuestasRoundsView}
          currentUserId={user?.id ?? ''}
        />
      </Suspense>
    </div>
  )
}
