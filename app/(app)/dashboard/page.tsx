import { createClient } from '@/lib/supabase/server'
import type { IndividualStanding, Round } from '@/lib/types'
import { formatDate } from '@/lib/types'
import Link from 'next/link'
import ConfirmCourtButton from '@/components/ConfirmCourtButton'

const MEDALS = ['🥇', '🥈', '🥉', '4º']

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: standings }, { data: nextRound }, { data: season }] = await Promise.all([
    supabase.from('individual_standings').select('*'),
    supabase
      .from('rounds')
      .select('*, court_booker:profiles!court_booker_id(id, name), match:matches(*, team1_p1:profiles!team1_p1_id(id, name), team1_p2:profiles!team1_p2_id(id, name), team2_p1:profiles!team2_p1_id(id, name), team2_p2:profiles!team2_p2_id(id, name))')
      .eq('status', 'scheduled')
      .order('scheduled_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from('seasons').select('id').eq('status', 'active').maybeSingle(),
  ])

  const topIndividual = (standings as IndividualStanding[] | null)?.slice(0, 4) ?? []
  const round = nextRound as Round | null
  const match = round?.match as { team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string } } | undefined

  return (
    <div className="flex flex-col">
      {/* Header degradado */}
      <div
        className="px-5 pt-5 pb-3 text-white flex items-start justify-between"
        style={{ background: 'linear-gradient(135deg,#2E6FF2,#5B8CFF)', borderRadius: '0 0 24px 24px' }}
      >
        <div>
          <div className="font-heading text-[22px] font-extrabold flex items-center gap-2">🎾 Liga Pádel</div>
          <div className="text-xs opacity-90 mt-0.5">4 jugadores · 9 jornadas · ~4 meses</div>
        </div>
        <Link
          href="/perfil"
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0"
          style={{ background: 'rgba(255,255,255,0.2)' }}
        >
          🙋
        </Link>
      </div>

      <div className="px-5 pt-4 pb-6 flex flex-col gap-4">
        {/* Próximo partido */}
        {round ? (
          <div
            className="rounded-[20px] p-4"
            style={{ background: 'var(--surface)', boxShadow: '0 4px 14px rgba(46,111,242,0.08)', border: '2px solid var(--border)' }}
          >
            <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
              📅 Próximo partido · Jornada {round.round_number}
            </div>
            <div className="font-heading text-[17px] font-bold mt-1 capitalize">{formatDate(round.scheduled_date)}</div>

            {match && (
              <div className="flex justify-between items-center mt-2.5 rounded-[14px] px-3 py-2.5" style={{ background: 'var(--surface2)' }}>
                <span className="text-[13px] font-bold">{match.team1_p1?.name} / {match.team1_p2?.name}</span>
                <span className="text-[11px] font-bold" style={{ color: '#9AA5B8' }}>VS</span>
                <span className="text-[13px] font-bold">{match.team2_p1?.name} / {match.team2_p2?.name}</span>
              </div>
            )}

            <div className="flex justify-between items-center mt-3">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>🏟️ Reserva: {round.court_booker?.name ?? 'Sin asignar'}</span>
              {round.court_confirmed ? (
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
                  ✅ Confirmada
                </span>
              ) : (
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full" style={{ background: 'var(--orange-bg)', color: 'var(--orange)' }}>
                  ⏳ Pendiente
                </span>
              )}
            </div>

            {!round.court_confirmed && round.court_booker_id === user?.id && (
              <div className="mt-2.5">
                <ConfirmCourtButton roundId={round.id} />
              </div>
            )}
          </div>
        ) : !season ? (
          <Link
            href="/admin/temporada"
            className="block rounded-[20px] p-4 text-center transition hover:opacity-90"
            style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}
          >
            <p className="font-heading font-bold text-sm">⚡ Aún no has creado la liga</p>
            <p className="text-xs mt-1">Toca aquí para elegir fecha de inicio, día y hora fija de los partidos.</p>
          </Link>
        ) : (
          <div className="rounded-[20px] p-4 text-sm text-center" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '2px solid var(--border)' }}>
            No hay próximas jornadas programadas.{' '}
            <Link href="/admin/jornadas/nueva" className="font-bold" style={{ color: 'var(--accent)' }}>Crea la primera →</Link>
          </div>
        )}

        {/* CTA apuestas */}
        <Link
          href="/apuestas"
          className="font-heading rounded-2xl py-3.5 font-extrabold text-sm flex items-center justify-center gap-2 transition hover:opacity-90"
          style={{ background: 'var(--yellow)', color: 'var(--yellow-text)' }}
        >
          💰 Ir al mercado de apuestas
        </Link>

        {/* Clasificación individual top 4 */}
        <div>
          <div className="font-heading text-sm font-bold mb-2">🏆 Clasificación individual</div>
          <div className="rounded-[18px] px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 4px 14px rgba(0,0,0,0.04)' }}>
            {topIndividual.map((row, i) => (
              <div
                key={row.player_id}
                className="flex justify-between items-center py-2.5"
                style={{ borderBottom: i < topIndividual.length - 1 ? '1px solid var(--hairline)' : undefined }}
              >
                <span className="text-[13px] font-bold">{MEDALS[i]} {row.name}</span>
                <span className="text-[13px] font-extrabold" style={{ color: 'var(--accent)' }}>{row.total_points} pts</span>
              </div>
            ))}
            {!topIndividual.length && (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Aún no hay partidos jugados
              </div>
            )}
          </div>
        </div>

        {/* Footer nota */}
        <div
          className="rounded-2xl px-3.5 py-3 text-xs flex items-center gap-2"
          style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}
        >
          🍽️ Al terminar la liga, 1º y 2º cenan invitados por 3º y 4º.
        </div>
      </div>
    </div>
  )
}
