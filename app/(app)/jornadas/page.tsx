import { createClient } from '@/lib/supabase/server'
import type { Round } from '@/lib/types'
import { formatDate } from '@/lib/types'
import Link from 'next/link'

export default async function JornadasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rounds } = await supabase
    .from('rounds')
    .select('*, court_booker:profiles!court_booker_id(id, name), match:matches(id, winner, set1_t1, set1_t2, set2_t1, set2_t2, set3_t1, set3_t2, team1_p1:profiles!team1_p1_id(id, name), team1_p2:profiles!team1_p2_id(id, name), team2_p1:profiles!team2_p1_id(id, name), team2_p2:profiles!team2_p2_id(id, name))')
    .order('scheduled_date', { ascending: true })

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-xl font-bold">Jornadas</h1>

      {!rounds?.length ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No hay jornadas creadas todavía.
        </p>
      ) : (
        (rounds as Round[]).map(round => (
          <Link
            key={round.id}
            href={`/jornadas/${round.id}`}
            className="block rounded-xl p-4 transition hover:opacity-90"
            style={{
              background: 'var(--surface)',
              border: `1px solid ${round.status === 'played' ? 'var(--border)' : 'var(--border)'}`,
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  J{round.round_number}
                </span>
                <StatusBadge status={round.status} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatDate(round.scheduled_date)}
              </span>
            </div>

            {round.match ? (
              <div className="text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span>{(round.match as { team1_p1?: { name: string }; team1_p2?: { name: string } }).team1_p1?.name} & {(round.match as { team1_p1?: { name: string }; team1_p2?: { name: string } }).team1_p2?.name}</span>
                  {round.status === 'played' && round.match.winner && (
                    <span className="font-bold" style={{ color: round.match.winner === 'team1' ? 'var(--green)' : 'var(--text-muted)' }}>
                      {round.match.set1_t1}-{round.match.set1_t2}
                    </span>
                  )}
                </div>
                <div className="text-xs my-1" style={{ color: 'var(--text-muted)' }}>vs</div>
                <div className="flex items-center justify-between">
                  <span>{(round.match as { team2_p1?: { name: string }; team2_p2?: { name: string } }).team2_p1?.name} & {(round.match as { team2_p1?: { name: string }; team2_p2?: { name: string } }).team2_p2?.name}</span>
                  {round.status === 'played' && round.match.winner && (
                    <span className="font-bold" style={{ color: round.match.winner === 'team2' ? 'var(--green)' : 'var(--text-muted)' }}>
                      {round.match.set1_t2}-{round.match.set1_t1}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Parejas por confirmar</p>
            )}

            {/* Pista */}
            <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Reserva: <span style={{ color: round.court_booker_id === user?.id ? 'var(--accent)' : 'var(--text)' }}>
                  {round.court_booker?.name ?? 'Sin asignar'}
                  {round.court_booker_id === user?.id && ' (tú)'}
                </span>
              </span>
              <span className="text-xs font-medium" style={{ color: round.court_confirmed ? 'var(--green)' : 'var(--orange)' }}>
                {round.court_confirmed ? '✓ Confirmada' : '⏳ Pendiente'}
              </span>
            </div>
          </Link>
        ))
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Round['status'] }) {
  const map = {
    scheduled: { label: 'Programada', color: 'var(--text-muted)' },
    played: { label: 'Jugada', color: 'var(--green)' },
    cancelled: { label: 'Cancelada', color: 'var(--red)' },
  }
  const { label, color } = map[status]
  return <span className="text-xs font-medium" style={{ color }}>{label}</span>
}
