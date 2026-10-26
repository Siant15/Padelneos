import { createClient, getCachedUser } from '@/lib/supabase/server'
import ReservaForm from './ReservaForm'

export default async function ReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params
  const supabase = await createClient()
  const user = await getCachedUser()

  const { data: round, error } = await supabase
    .from('rounds')
    .select('round_number, scheduled_date, scheduled_time, club, court_cost, court_booker_id, court_booker:profiles!court_booker_id(name)')
    .eq('id', roundId)
    .maybeSingle()

  if (error || !round) {
    return (
      <div className="space-y-5 pb-4">
        <h1 className="text-xl font-bold">Reservar pista</h1>
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>
          ⚠ No se pudo cargar la jornada{error ? `: ${error.message}` : ''}
        </div>
      </div>
    )
  }

  const booker = round.court_booker as unknown as { name: string } | { name: string }[] | null
  const bookerName = (Array.isArray(booker) ? booker[0]?.name : booker?.name) ?? null

  return (
    <ReservaForm
      roundId={roundId}
      roundNumber={round.round_number}
      bookerName={bookerName}
      isResponsable={!!user && user.id === round.court_booker_id}
      initial={{
        scheduled_date: round.scheduled_date ?? '',
        scheduled_time: round.scheduled_time?.slice(0, 5) ?? '',
        club: round.club ?? '',
        court_cost: round.court_cost?.toString() ?? '',
      }}
    />
  )
}
