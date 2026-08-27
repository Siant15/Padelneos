import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import ResultadoForm from './ResultadoForm'

type MatchRow = {
  id: string
  set1_t1: number | null; set1_t2: number | null
  set2_t1: number | null; set2_t2: number | null
  set3_t1: number | null; set3_t2: number | null
  winner: string | null
  team1_p1?: { id: string; name: string }; team1_p2?: { id: string; name: string }
  team2_p1?: { id: string; name: string }; team2_p2?: { id: string; name: string }
} | null

export default async function ResultadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.from('rounds').select(`
    round_number,
    match:matches(id, set1_t1, set1_t2, set2_t1, set2_t2, set3_t1, set3_t2, winner,
      team1_p1:profiles!team1_p1_id(id, name),
      team1_p2:profiles!team1_p2_id(id, name),
      team2_p1:profiles!team2_p1_id(id, name),
      team2_p2:profiles!team2_p2_id(id, name))
  `).eq('id', roundId).maybeSingle()

  if (error || !data) {
    return (
      <div className="space-y-5 pb-4">
        <h1 className="text-xl font-bold">Resultado del partido</h1>
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>
          ⚠ No se pudo cargar la jornada{error ? `: ${error.message}` : ''}
        </div>
      </div>
    )
  }

  const m = data.match as unknown as MatchRow
  const roundNumber = data.round_number ?? 0

  if (!m) {
    const { data: allPlayers } = await supabase.from('profiles').select('*').order('name')
    return (
      <ResultadoForm
        roundId={roundId}
        roundNumber={roundNumber}
        mode="no-match"
        matchId=""
        players={[]}
        sets={[{ t1: '', t2: '' }, { t1: '', t2: '' }]}
        allPlayers={(allPlayers as Profile[]) ?? []}
      />
    )
  }

  const players = ([
    { id: m.team1_p1?.id ?? '', name: m.team1_p1?.name ?? '', team: 1 as const },
    { id: m.team1_p2?.id ?? '', name: m.team1_p2?.name ?? '', team: 1 as const },
    { id: m.team2_p1?.id ?? '', name: m.team2_p1?.name ?? '', team: 2 as const },
    { id: m.team2_p2?.id ?? '', name: m.team2_p2?.name ?? '', team: 2 as const },
  ]).filter(p => p.id)

  const sets = [
    { t1: m.set1_t1?.toString() ?? '', t2: m.set1_t2?.toString() ?? '' },
    { t1: m.set2_t1?.toString() ?? '', t2: m.set2_t2?.toString() ?? '' },
  ]
  if (m.set3_t1 !== null && m.set3_t1 !== undefined) {
    sets.push({ t1: m.set3_t1.toString(), t2: m.set3_t2?.toString() ?? '' })
  }

  return (
    <ResultadoForm
      roundId={roundId}
      roundNumber={roundNumber}
      mode="ready"
      matchId={m.id}
      players={players}
      sets={sets}
      allPlayers={[]}
    />
  )
}
