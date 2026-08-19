import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatDate, getMatchScore, getPairName } from '@/lib/types'
import ConfirmCourtButton from '@/components/ConfirmCourtButton'
import type { BettingMarket, MatchStat } from '@/lib/types'
import Link from 'next/link'

export default async function JornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: round } = await supabase
    .from('rounds')
    .select(`
      *,
      court_booker:profiles!court_booker_id(id, name),
      match:matches(
        *,
        team1_p1:profiles!team1_p1_id(id, name),
        team1_p2:profiles!team1_p2_id(id, name),
        team2_p1:profiles!team2_p1_id(id, name),
        team2_p2:profiles!team2_p2_id(id, name)
      )
    `)
    .eq('id', id)
    .single()

  if (!round) notFound()

  const match = round.match

  // Stats si hay partido jugado
  let stats: MatchStat[] = []
  if (match?.id) {
    const { data } = await supabase
      .from('match_stats')
      .select('*, player:profiles(id, name)')
      .eq('match_id', match.id)
    stats = data ?? []
  }

  // Mercados de apuestas de esta jornada
  const { data: markets } = await supabase
    .from('betting_markets')
    .select('*, options:betting_options(*), bets(*)')
    .eq('round_id', id)
    .order('created_at')

  const isBooker = round.court_booker_id === user?.id

  return (
    <div className="space-y-5 pb-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>
              Jornada {round.round_number}
            </span>
            <StatusBadge status={round.status} />
          </div>
          <h1 className="text-lg font-bold capitalize">{formatDate(round.scheduled_date)}</h1>
        </div>
      </div>

      {/* Reserva de pista */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-muted)' }}>RESERVA DE PISTA</p>
            <p className="font-medium">
              {round.court_booker?.name ?? 'Sin asignar'}
              {isBooker && <span className="ml-1 text-xs" style={{ color: 'var(--accent)' }}>(tú)</span>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-sm font-medium" style={{ color: round.court_confirmed ? 'var(--green)' : 'var(--orange)' }}>
              {round.court_confirmed ? '✓ Confirmada' : '⏳ Pendiente'}
            </span>
            {isBooker && !round.court_confirmed && (
              <ConfirmCourtButton roundId={round.id} />
            )}
          </div>
        </div>
      </div>

      {/* Partido */}
      {match ? (
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>PARTIDO</p>

          <div className="space-y-3">
            {/* Equipo 1 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{getPairName(match, 'team1')}</p>
              </div>
              {match.winner && (
                <div className="text-right">
                  <span
                    className="text-lg font-bold"
                    style={{ color: match.winner === 'team1' ? 'var(--green)' : 'var(--text-muted)' }}
                  >
                    {match.winner === 'team1' ? '🏆' : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Score */}
            {match.winner ? (
              <div className="text-center py-2">
                <span className="text-xl font-bold">{getMatchScore(match)}</span>
              </div>
            ) : (
              <div className="text-center py-2 text-sm" style={{ color: 'var(--text-muted)' }}>vs</div>
            )}

            {/* Equipo 2 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{getPairName(match, 'team2')}</p>
              </div>
              {match.winner && (
                <div className="text-right">
                  <span
                    className="text-lg font-bold"
                    style={{ color: match.winner === 'team2' ? 'var(--green)' : 'var(--text-muted)' }}
                  >
                    {match.winner === 'team2' ? '🏆' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          Parejas por confirmar
        </div>
      )}

      {/* Stats individuales */}
      {stats.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>ESTADÍSTICAS</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="text-left pb-2">Jugador</th>
                  <th className="text-center pb-2">🎯 Aces</th>
                  <th className="text-center pb-2">❌ DF</th>
                  <th className="text-center pb-2">🎱 B3</th>
                  <th className="text-center pb-2">💥 SC</th>
                </tr>
              </thead>
              <tbody>
                {(stats as MatchStat[]).map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-2 font-medium">{s.player?.name}</td>
                    <td className="text-center py-2">{s.aces}</td>
                    <td className="text-center py-2">{s.double_faults}</td>
                    <td className="text-center py-2">{s.bolas_por_3}</td>
                    <td className="text-center py-2">{s.smash_al_cristal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            DF=Dobles faltas · B3=Bolas por 3 · SC=Smash al cristal
          </p>
        </div>
      )}

      {/* Apuestas */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Apuestas 🎰</h2>
          <Link
            href={`/apuestas/${id}`}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {(markets as BettingMarket[] | null)?.length ? 'Ver mercados' : 'Sin mercados'}
          </Link>
        </div>

        {(markets as BettingMarket[] | null)?.length ? (
          <div className="space-y-2">
            {(markets as BettingMarket[]).slice(0, 2).map(m => (
              <div
                key={m.id}
                className="rounded-xl px-4 py-3 text-sm"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <p className="font-medium">{m.description}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {m.resolved ? '✓ Resuelta' : `${m.bets?.length ?? 0} apuesta(s)`}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Aún no hay mercados de apuestas para esta jornada.
          </p>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    scheduled: { label: 'Programada', color: 'var(--text-muted)' },
    played: { label: 'Jugada', color: 'var(--green)' },
    cancelled: { label: 'Cancelada', color: 'var(--red)' },
  }
  const { label, color } = map[status] ?? { label: status, color: 'var(--text-muted)' }
  return <span className="text-xs font-medium" style={{ color }}>{label}</span>
}
