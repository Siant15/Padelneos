import { createClient } from '@/lib/supabase/server'
import type { IndividualStanding, Round } from '@/lib/types'
import { formatDate } from '@/lib/types'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: standings }, { data: nextRounds }] = await Promise.all([
    supabase.from('individual_standings').select('*'),
    supabase
      .from('rounds')
      .select('*, court_booker:profiles!court_booker_id(id, name), match:matches(*)')
      .eq('status', 'scheduled')
      .order('scheduled_date', { ascending: true })
      .limit(3),
  ])

  const currentUserStanding = (standings as IndividualStanding[] | null)?.find(
    s => s.player_id === user?.id
  )

  return (
    <div className="space-y-6 pb-4">
      {/* Header bienvenida */}
      {currentUserStanding && (
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Hola,</p>
          <h2 className="text-xl font-bold">{currentUserStanding.name}</h2>
          <div className="mt-3 flex gap-4">
            <Stat label="Puesto" value={
              (standings as IndividualStanding[]).findIndex(s => s.player_id === user?.id) + 1 + 'º'
            } />
            <Stat label="Puntos" value={`${currentUserStanding.total_points}`} />
            <Stat label="V/E/D" value={`${currentUserStanding.wins}/${currentUserStanding.draws}/${currentUserStanding.losses}`} />
          </div>
        </div>
      )}

      {/* Próximas jornadas */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Próximas jornadas</h3>
          <Link href="/jornadas" className="text-sm" style={{ color: 'var(--accent)' }}>Ver todas →</Link>
        </div>

        {!nextRounds?.length ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No hay jornadas programadas.</p>
        ) : (
          <div className="space-y-3">
            {(nextRounds as Round[]).map(round => (
              <Link
                key={round.id}
                href={`/jornadas/${round.id}`}
                className="block rounded-xl p-4 transition hover:opacity-90"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full mr-2"
                      style={{ background: 'var(--accent)', color: '#fff' }}>
                      J{round.round_number}
                    </span>
                    <span className="text-sm font-medium">{formatDate(round.scheduled_date)}</span>
                  </div>
                  <CourtBadge confirmed={round.court_confirmed} booker={round.court_booker?.name ?? ''} isMe={round.court_booker_id === user?.id} />
                </div>

                {round.match && (
                  <div className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <MatchPreview match={round.match} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Clasificación rápida */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Clasificación</h3>
          <Link href="/clasificacion" className="text-sm" style={{ color: 'var(--accent)' }}>Completa →</Link>
        </div>

        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border)' }}
        >
          {(standings as IndividualStanding[] | null)?.map((s, i) => (
            <div
              key={s.player_id}
              className="flex items-center justify-between px-4 py-3"
              style={{
                background: s.player_id === user?.id ? 'var(--surface2)' : 'var(--surface)',
                borderBottom: i < (standings?.length ?? 0) - 1 ? '1px solid var(--border)' : undefined,
              }}
            >
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg w-6 text-center" style={{
                  color: i === 0 ? 'var(--yellow)' : i === 1 ? 'var(--text-muted)' : 'var(--text-muted)'
                }}>
                  {i + 1}
                </span>
                <span className="font-medium">{s.name}</span>
                {s.player_id === user?.id && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--accent)' }}>tú</span>
                )}
              </div>
              <span className="font-bold">{s.total_points} pts</span>
            </div>
          ))}
          {!standings?.length && (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Aún no hay partidos jugados
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="font-bold text-lg">{value}</p>
    </div>
  )
}

function CourtBadge({ confirmed, booker, isMe }: { confirmed: boolean; booker: string; isMe: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span style={{ color: confirmed ? 'var(--green)' : 'var(--orange)' }}>
        {confirmed ? '✓ Pista confirmada' : '⏳ Pista pendiente'}
      </span>
      {!confirmed && (
        <span style={{ color: 'var(--text-muted)' }}>
          ({isMe ? 'TÚ' : booker})
        </span>
      )}
    </div>
  )
}

function MatchPreview({ match }: { match: { team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string } } }) {
  return (
    <span>
      {match.team1_p1?.name} & {match.team1_p2?.name}
      <span className="mx-2" style={{ color: 'var(--border)' }}>vs</span>
      {match.team2_p1?.name} & {match.team2_p2?.name}
    </span>
  )
}
