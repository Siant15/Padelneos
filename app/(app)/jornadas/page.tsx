import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/types'
import JornadasAccordion, { type JornadaViewModel } from '@/components/JornadasAccordion'

export default async function JornadasPage() {
  const supabase = await createClient()

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

  const items: JornadaViewModel[] = (rounds ?? []).map(round => {
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

  return (
    <div className="px-5 pt-5 pb-6">
      <h1 className="font-heading text-[22px] font-extrabold mb-4">📅 Calendario</h1>

      {!items.length ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No hay jornadas creadas todavía.</p>
      ) : (
        <JornadasAccordion items={items} />
      )}
    </div>
  )
}
