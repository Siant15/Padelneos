import { Suspense } from 'react'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import type { IndividualStanding, PairStanding } from '@/lib/types'
import { formatDate, getJornadaReservaStatus } from '@/lib/types'
import LigaTabs from '@/components/LigaTabs'
import type { JornadaViewModel } from '@/components/JornadasAccordion'
import { getRoundActa, getRoundBettingContext } from '@/lib/betting-queries'
import { getCachedActiveSeason, getCachedPlayers, getCachedSeasonRounds, getCachedSeasonAggregates } from '@/lib/supabase/cached'
import type { ApuestasRoundEntry } from '@/components/ApuestasTab'

const MEDALS = ['🥇', '🥈', '🥉', '4º']

type BetRow = { round_id: string; player_id: string; rank: number; chips_net: number; point_bonus: number; player: { id: string; name: string } | { id: string; name: string }[] | null }

function playerName(player: BetRow['player']): string | undefined {
  const p = Array.isArray(player) ? player[0] : player
  return p?.name
}

export default async function LigaPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  const userId = user?.id ?? ''

  // Temporada activa, jugadores y jornadas: iguales para los 4 jugadores,
  // así que vienen de la caché de lib/supabase/cached.ts (unos segundos de
  // margen) en vez de pedirse de cero en cada navegación entre pestañas.
  const [activeSeasonRow, players] = await Promise.all([
    getCachedActiveSeason(),
    getCachedPlayers(),
  ])

  const seasonId = activeSeasonRow?.id
  const rounds = seasonId ? await getCachedSeasonRounds(seasonId) : []

  const matchIds = (rounds ?? []).map(r => (r.match as { id: string } | null)?.id).filter(Boolean) as string[]
  const roundIds = (rounds ?? []).map(r => r.id)

  const { allStats, individual, pairs, marketsByRound, settlements, allBetResults } = seasonId
    ? await getCachedSeasonAggregates(seasonId, matchIds, roundIds)
    : { allStats: [], individual: [], pairs: [], marketsByRound: [], settlements: [], allBetResults: [] }

  // ─── Calendario ───────────────────────────────────────────
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

    const betResults = ((allBetResults ?? []) as BetRow[]).filter(b => b.round_id === round.id)
    const betWinner = betResults.find(b => b.rank === 1)
    const betSecond = betResults.find(b => b.rank === 2)

    const isNext = nextRound?.id === round.id
    const played = round.status === 'played'
    const effectiveTime = round.scheduled_time?.slice(0, 5) ?? ''
    const effectiveClub = round.club ?? ''

    const reservaStatus = getJornadaReservaStatus(round)
    const statusView = {
      pendiente: { label: '⏳ Pendiente de reserva', bg: 'var(--orange-bg)', color: 'var(--orange)' },
      reservada: { label: '📅 Reservada', bg: 'var(--tint)', color: 'var(--text-muted2)' },
      finalizada: { label: '✔ Finalizada', bg: 'var(--green-bg)', color: 'var(--green)' },
    }[reservaStatus]

    let scoreLabel = ''
    if (match && match.set1_t1 !== null) {
      const sets = [`${match.set1_t1}-${match.set1_t2}`, `${match.set2_t1}-${match.set2_t2}`]
      if (match.set3_t1 !== null) sets.push(`${match.set3_t1}-${match.set3_t2}`)
      scoreLabel = sets.join(', ')
    }

    return {
      id: round.id,
      roundNumber: round.round_number,
      numLabel: String(round.round_number),
      rawDate: round.scheduled_date,
      dateLabel: round.scheduled_date ? formatDate(round.scheduled_date) : 'Por confirmar',
      timeLabel: effectiveTime,
      clubLabel: effectiveClub,
      pairALabel: match ? `${match.team1_p1?.name ?? '?'} / ${match.team1_p2?.name ?? '?'}` : 'Por confirmar',
      pairBLabel: match ? `${match.team2_p1?.name ?? '?'} / ${match.team2_p2?.name ?? '?'}` : '',
      responsableName: round.court_booker?.name ?? 'Sin asignar',
      reservaStatus,
      played,
      isNext,
      statusLabel: statusView.label,
      tagBg: statusView.bg,
      tagColor: statusView.color,
      scoreLabel,
      winnerLabel: match?.winner === 'team1'
        ? `${match.team1_p1?.name} / ${match.team1_p2?.name}`
        : match?.winner === 'team2'
          ? `${match.team2_p1?.name} / ${match.team2_p2?.name}`
          : '',
      stats,
      betWinner: (betWinner && playerName(betWinner.player)) ?? '',
      betSecond: (betSecond && playerName(betSecond.player)) ?? '',
    }
  })

  // ─── Clasificación ────────────────────────────────────────
  const individualRows = ((individual as IndividualStanding[] | null) ?? []).map((s, i) => ({
    medal: MEDALS[i] ?? `${i + 1}º`,
    name: s.name,
    pj: s.matches_played,
    pg: s.wins,
    pe: s.draws,
    pp: s.losses,
    apuestas: s.betting_bonus,
    total: s.total_points,
  }))

  const pairRows = ((pairs as PairStanding[] | null) ?? []).map(p => ({
    name: `${p.p1_name} / ${p.p2_name}`,
    pj: p.matches_played,
    pg: p.wins,
    pe: p.draws,
    pp: p.losses,
    pts: p.points,
  }))

  // Clasificación → Apuestas: un jugador por fila, una jornada por
  // columna con los puntos que ganó esa jornada (en blanco si esa
  // jornada aún no se ha liquidado), y el sumatorio al final. Se
  // construye directamente de betting_round_results, sin ranking
  // aparte — así nunca hay dos fuentes distintas para lo mismo.
  const orderedRounds = (rounds ?? []).map(r => ({ id: r.id, roundNumber: r.round_number }))
  const apuestasRoundLabels = orderedRounds.map(r => `J${r.roundNumber}`)
  const clasificacionApuestasMatrix = ((players as { id: string; name: string }[] | null) ?? [])
    .map(p => {
      const cells = orderedRounds.map(r => {
        const result = ((allBetResults ?? []) as BetRow[]).find(b => b.round_id === r.id && b.player_id === p.id)
        return result ? result.point_bonus : null
      })
      const total = cells.reduce<number>((s, c) => s + (c ?? 0), 0)
      return { name: p.name, cells, total }
    })
    .sort((a, b) => b.total - a.total)

  // ─── Apuestas (acta de la jornada) ────────────────────────
  // Jornadas ya liquidadas de la temporada activa: se precalcula el acta
  // completa de todas ellas (dataset pequeño en esta liga) para que el
  // selector de "Ver otras jornadas" cambie de jornada sin navegar ni
  // volver a pedir nada al servidor.
  const settledRoundIds = new Set((settlements ?? []).map(s => s.round_id))

  // Toda jornada de la temporada activa cae en una de tres categorías:
  // liquidada (acta de solo lectura), abierta para apostar (aunque no sea
  // la más próxima — puede haber varias con mercados ya creados), o
  // pendiente (jugada pero sin liquidar, o todavía sin preguntas). Así
  // "Ver otras jornadas" puede saltar a cualquier J1..J9, no solo a las
  // ya liquidadas.
  const matchLabels = (r: { match: unknown }) => {
    const m = r.match as { team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string } } | null
    return {
      pair1Label: m ? `${m.team1_p1?.name ?? '?'} / ${m.team1_p2?.name ?? '?'}` : null,
      pair2Label: m ? `${m.team2_p1?.name ?? '?'} / ${m.team2_p2?.name ?? '?'}` : null,
    }
  }

  const settledRoundRefs = (rounds ?? []).filter(r => settledRoundIds.has(r.id))
  const openRoundRefs = (rounds ?? []).filter(r =>
    !settledRoundIds.has(r.id) && r.status === 'scheduled' && (marketsByRound ?? []).some(m => m.round_id === r.id)
  )
  const pendingRoundRefs = (rounds ?? []).filter(r =>
    !settledRoundIds.has(r.id) && !openRoundRefs.some(o => o.id === r.id)
  )

  const playerList = (players as { id: string; name: string }[] | null) ?? []
  const settledEntries: ApuestasRoundEntry[] = await Promise.all(
    settledRoundRefs.map(async r => ({ kind: 'settled' as const, roundId: r.id, roundNumber: r.round_number, acta: await getRoundActa(supabase, r.id, playerList) }))
  )

  const { data: catalogTemplates } = await supabase.from('betting_question_templates').select('*').eq('active', true).order('text')

  const openEntries: ApuestasRoundEntry[] = userId ? await Promise.all(
    openRoundRefs.map(async r => {
      const ctx = await getRoundBettingContext(supabase, r.id, userId)
      const templateIds = [...new Set(ctx.markets.map(m => m.template_id).filter((id): id is string => !!id))]
      const { data: jackpots } = templateIds.length
        ? await supabase.from('jackpots').select('template_id, chips').eq('season_id', seasonId ?? '').in('template_id', templateIds)
        : { data: [] as { template_id: string; chips: number }[] }
      const jackpotByTemplate: Record<string, number> = {}
      for (const j of jackpots ?? []) jackpotByTemplate[j.template_id] = j.chips
      const usedTemplateIds = new Set(templateIds)
      const availableTemplates = (catalogTemplates ?? []).filter(t => !usedTemplateIds.has(t.id))
      return {
        kind: 'open' as const,
        roundId: r.id,
        roundNumber: r.round_number,
        ...matchLabels(r),
        scheduledDate: r.scheduled_date,
        scheduledTime: r.scheduled_time,
        club: r.club,
        markets: ctx.markets,
        chipsLeft: ctx.chipsLeft,
        jackpotByTemplate,
        availableTemplates,
      }
    })
  ) : []

  const pendingEntries: ApuestasRoundEntry[] = pendingRoundRefs.map(r => ({
    kind: 'pending' as const,
    roundId: r.id,
    roundNumber: r.round_number,
    ...matchLabels(r),
    scheduledDate: r.scheduled_date,
    scheduledTime: r.scheduled_time,
    club: r.club,
    reason: r.status === 'played' ? 'awaiting_settlement' as const : 'no_questions' as const,
  }))

  const apuestasRounds: ApuestasRoundEntry[] = [...settledEntries, ...openEntries, ...pendingEntries]
    .sort((a, b) => a.roundNumber - b.roundNumber)

  // ─── Estado de la liga (para las acciones contextuales de Calendario) ──
  const activeSeasonForTabs = activeSeasonRow
    ? { id: activeSeasonRow.id, name: activeSeasonRow.name, minMatches: activeSeasonRow.min_matches }
    : null
  const finalRound = (rounds ?? []).find(r => r.round_number === activeSeasonRow?.min_matches)
  const isLeagueComplete = !!finalRound && finalRound.status === 'played'

  return (
    <div className="px-5 pt-5 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-heading text-[22px] font-extrabold">🎾 Liga</h1>
      </div>
      <Suspense fallback={null}>
        <LigaTabs
          activeSeason={activeSeasonForTabs}
          players={(players as { id: string; name: string }[] | null) ?? []}
          calendarioItems={calendarioItems}
          isLeagueComplete={isLeagueComplete}
          clasificacionIndividual={individualRows}
          clasificacionParejas={pairRows}
          clasificacionApuestasMatrix={clasificacionApuestasMatrix}
          clasificacionApuestasRoundLabels={apuestasRoundLabels}
          userId={userId}
          apuestasRounds={apuestasRounds}
        />
      </Suspense>
    </div>
  )
}
