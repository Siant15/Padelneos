import { createClient } from '@/lib/supabase/server'
import type { IndividualStanding, PairStanding, Round } from '@/lib/types'
import { formatDate } from '@/lib/types'
import Link from 'next/link'
import ConfirmCourtButton from '@/components/ConfirmCourtButton'

const MEDALS = ['🥇', '🥈', '🥉', '4º']

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: season } = await supabase
    .from('seasons')
    .select('id, match_time, default_club')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)

  const seasonId = season?.[0]?.id

  const [{ data: standings }, { data: nextRound }, { data: topPairData }] = await Promise.all([
    seasonId
      ? supabase.from('individual_standings').select('*').eq('season_id', seasonId).order('total_points', { ascending: false }).order('sport_points', { ascending: false })
      : Promise.resolve({ data: [] as IndividualStanding[] }),
    seasonId
      ? supabase
        .from('rounds')
        .select('*, court_booker:profiles!court_booker_id(id, name), match:matches(*, team1_p1:profiles!team1_p1_id(id, name), team1_p2:profiles!team1_p2_id(id, name), team2_p1:profiles!team2_p1_id(id, name), team2_p2:profiles!team2_p2_id(id, name))')
        .eq('season_id', seasonId)
        .eq('status', 'scheduled')
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null as Round | null }),
    seasonId
      ? supabase.from('pair_standings').select('*').eq('season_id', seasonId).order('points', { ascending: false }).order('wins', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null as PairStanding | null }),
  ])

  const allStandings = (standings as IndividualStanding[] | null) ?? []
  const topIndividual = allStandings.slice(0, 4)
  const dinnerPayers = allStandings.length >= 3 ? allStandings.slice(-2).reverse() : []
  const topPair = (topPairData as PairStanding | null)?.matches_played ? (topPairData as PairStanding) : null
  const round = nextRound as Round | null
  const match = round?.match as { team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string } } | undefined
  const effectiveTime = (round?.scheduled_time ?? season?.[0]?.match_time)?.slice(0, 5)
  const effectiveClub = round?.club ?? season?.[0]?.default_club

  return (
    <div className="flex flex-col">
      {/* Header degradado */}
      <div
        className="px-5 pt-4 pb-3 text-white"
        style={{ background: 'linear-gradient(135deg,#2E6FF2,#5B8CFF)', borderRadius: '0 0 24px 24px' }}
      >
        <div className="font-heading text-[17px] font-extrabold">👋 ¡Hola!</div>
        <div className="text-xs opacity-90 mt-0.5">4 jugadores · 9 jornadas · ~4 meses</div>
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
            <div className="font-heading text-[17px] font-bold mt-1 capitalize">
              {formatDate(round.scheduled_date)}{effectiveTime && ` · ${effectiveTime}`}
              {round.scheduled_time && (
                <span className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full align-middle" style={{ background: 'var(--orange-bg)', color: 'var(--orange)' }}>
                  hora especial
                </span>
              )}
            </div>

            {effectiveClub && (
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                📍 {effectiveClub}{round.club && ' (club especial)'}
              </div>
            )}

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

            <div className="mt-3 pt-3 flex gap-2" style={{ borderTop: '1px dashed var(--hairline)' }}>
              <Link
                href={`/admin/jornadas/${round.id}/resultado`}
                className="flex-1 text-center text-xs font-bold py-2 rounded-xl transition hover:opacity-90"
                style={{ background: 'var(--tint)', color: '#555' }}
              >
                📝 Registrar resultado
              </Link>
              <Link
                href={`/admin/jornadas/${round.id}/mercados`}
                className="flex-1 text-center text-xs font-bold py-2 rounded-xl transition hover:opacity-90"
                style={{ background: 'var(--surface2)', color: 'var(--accent)' }}
              >
                🎰 Apuestas
              </Link>
            </div>
          </div>
        ) : !season?.length ? (
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
          href="/liga?tab=apuestas"
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

        {/* Pareja de oro */}
        {topPair && (
          <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface2)' }}>
            <p className="text-xs font-bold mb-1" style={{ color: 'var(--accent)' }}>👑 Pareja de oro de la temporada</p>
            <p className="text-xs">
              <strong>{topPair.p1_name} / {topPair.p2_name}</strong> · {topPair.wins}-{topPair.losses} en {topPair.matches_played} partidos
            </p>
          </div>
        )}

        {/* Termómetro de la cena */}
        {dinnerPayers.length === 2 && (
          <div
            className="rounded-2xl px-3.5 py-3"
            style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}
          >
            <p className="text-xs font-bold mb-1">🌡️ Si la liga acabase hoy...</p>
            <p className="text-xs">
              Pagarían la cena: <strong>{dinnerPayers[0].name}</strong> y <strong>{dinnerPayers[1].name}</strong>
            </p>
          </div>
        )}

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
