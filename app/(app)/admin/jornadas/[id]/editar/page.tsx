import { createClient } from '@/lib/supabase/server'
import EditarJornadaForm from './EditarJornadaForm'

export default async function EditarJornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params
  const supabase = await createClient()

  const [{ data: players }, { data: round, error }] = await Promise.all([
    supabase.from('profiles').select('id, name').order('name'),
    supabase.from('rounds').select('*, match:matches(*)').eq('id', roundId).maybeSingle(),
  ])

  if (error || !round) {
    return (
      <div className="space-y-5 pb-4">
        <h1 className="text-xl font-bold">Editar jornada</h1>
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>
          ⚠ No se pudo cargar la jornada{error ? `: ${error.message}` : ''}
        </div>
      </div>
    )
  }

  const match = (round?.match ?? null) as { id: string; team1_p1_id: string; team1_p2_id: string; team2_p1_id: string; team2_p2_id: string; winner: string | null } | null

  return (
    <EditarJornadaForm
      roundId={roundId}
      players={players ?? []}
      initialHasResult={!!match?.winner}
      initialForm={{
        scheduled_date: round?.scheduled_date ?? '',
        scheduled_time: round?.scheduled_time?.slice(0, 5) ?? '',
        club: round?.club ?? '',
        court_booker_id: round?.court_booker_id ?? '',
        status: round?.status ?? 'scheduled',
        team1_p1_id: match?.team1_p1_id ?? '',
        team1_p2_id: match?.team1_p2_id ?? '',
        team2_p1_id: match?.team2_p1_id ?? '',
        team2_p2_id: match?.team2_p2_id ?? '',
        matchId: match?.id ?? '',
      }}
    />
  )
}
