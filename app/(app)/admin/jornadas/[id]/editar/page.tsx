import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import EditarJornadaForm from './EditarJornadaForm'

export default async function EditarJornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params
  const supabase = await createClient()

  const [{ data: players }, { data: round }] = await Promise.all([
    supabase.from('profiles').select('*').order('name'),
    supabase.from('rounds').select('*, match:matches(*)').eq('id', roundId).maybeSingle(),
  ])

  const match = (round?.match ?? null) as { id: string; team1_p1_id: string; team1_p2_id: string; team2_p1_id: string; team2_p2_id: string; winner: string | null } | null

  return (
    <EditarJornadaForm
      roundId={roundId}
      players={(players as Profile[]) ?? []}
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
