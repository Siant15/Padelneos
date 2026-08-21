import { createClient, getCachedUser } from '@/lib/supabase/server'
import type { IndividualStanding, PairStanding, Round } from '@/lib/types'
import { formatDate, estimateDinnerRisk } from '@/lib/types'
import Link from 'next/link'
import ConfirmCourtButton from '@/components/ConfirmCourtButton'
import DinnerRiskInfo from '@/components/DinnerRiskInfo'
import { getRoundBettingContext, getSeasonBettingRanking } from '@/lib/betting-queries'
import { getCachedActiveSeason, getCachedSeasonRounds, getCachedSeasonAggregates } from '@/lib/supabase/cached'

const MEDALS = ['🥇', '🥈', '🥉', '4º']

export default async function DashboardPage() {
  const supabase = await createClient()
  const user = await getCachedUser()

  const [{ data: profile }, activeSeasonRow] = await Promise.all([
    user ? supabase.from('profiles').select('name, avatar_url').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    getCachedActiveSeason(),
  ])

  const seasonId = activeSeasonRow?.id
  // Temporada/jornadas/clasificaciones: iguales para los 4 jugadores,
  // vienen de la caché compartida con Liga (lib/supabase/cached.ts) en
  // vez de pedirse de cero en cada navegación entre pestañas.
  const rounds = seasonId ? await getCachedSeasonRounds(seasonId) : []
  const matchIds = rounds.map(r => (r.match as { id: string } | null)?.id).filter(Boolean) as string[]
  const roundIds = rounds.map(r => r.id)

  const [{ individual, pairs }, seasonRankingEarly] = await Promise.all([
    seasonId ? getCachedSeasonAggregates(seasonId, matchIds, roundIds) : Promise.resolve({ individual: [], pairs: [] }),
    seasonId ? getSeasonBettingRanking(supabase, seasonId) : Promise.resolve([]),
  ])

  const nextRound = (rounds.find(r => r.status === 'scheduled') as Round | undefined) ?? null
  const topPairData = (pairs as PairStanding[])[0] ?? null
  const seasonRoundDates = rounds.filter(r => r.status !== 'played').map(r => ({ scheduled_date: r.scheduled_date }))

  const allStandings = (individual as IndividualStanding[] | null) ?? []
  const topIndividual = allStandings.slice(0, 4)

  // Riesgo de cena: se simulan todas las combinaciones de resultados de
  // las jornadas que quedan (las parejas de cada una ya están fijadas de
  // antemano, así que no hay que adivinarlas).
  const remainingPairings = rounds
    .filter(r => r.status === 'scheduled')
    .map(r => {
      const m = r.match as { team1_p1?: { id: string }; team1_p2?: { id: string }; team2_p1?: { id: string }; team2_p2?: { id: string } } | null
      if (!m?.team1_p1?.id || !m.team1_p2?.id || !m.team2_p1?.id || !m.team2_p2?.id) return null
      return { pair1: [m.team1_p1.id, m.team1_p2.id] as [string, string], pair2: [m.team2_p1.id, m.team2_p2.id] as [string, string] }
    })
    .filter((x): x is { pair1: [string, string]; pair2: [string, string] } => !!x)

  const dinnerRisk = estimateDinnerRisk(
    allStandings.map(s => ({ id: s.player_id, sportPoints: s.sport_points, bettingBonus: s.betting_bonus })),
    remainingPairings
  )
  const topPair = (topPairData as PairStanding | null)?.matches_played ? (topPairData as PairStanding) : null
  const round = nextRound as Round | null
  const match = round?.match as { team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string } } | undefined
  const effectiveTime = round?.scheduled_time?.slice(0, 5)
  const effectiveClub = round?.club

  const today = new Date().toISOString().slice(0, 10)
  const remainingJornadas = (seasonRoundDates ?? []).length
  const futureDates = (seasonRoundDates ?? []).map(r => r.scheduled_date).filter((d): d is string => !!d && d >= today)
  const lastDate = futureDates.at(-1)
  const remainingMonths = lastDate
    ? Math.max(1, Math.round((new Date(lastDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
    : 0

  // Zona 1 y 2 de apuestas de Inicio: mismas consultas que usa
  // Liga → Apuestas (lib/betting-queries.ts), nada de saldos ni
  // rankings calculados aparte. bettingContext depende del id de
  // `round` (resuelto arriba), así que no puede unirse a esa misma
  // tanda — pero seasonRanking sí, y ya se adelantó ahí.
  const bettingContext = round && user ? await getRoundBettingContext(supabase, round.id, user.id) : null
  const seasonRanking = seasonRankingEarly
  const topBettor = seasonRanking[0]

  return (
    <div className="flex flex-col">
      {/* Header degradado */}
      <div
        className="px-5 pt-4 pb-3 text-white flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg, oklch(0.44 0.1 155), oklch(0.38 0.09 160))', borderRadius: '0 0 24px 24px' }}
      >
        <div className="flex-1">
          <div className="font-heading text-[17px] font-extrabold">👋 ¡Hola{profile?.name ? ` ${profile.name}` : ''}!</div>
          {seasonId && (
            <div className="flex gap-2 flex-wrap mt-2.5">
              <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }}>
                ⏳ Quedan {remainingJornadas} jornada{remainingJornadas === 1 ? '' : 's'}
              </span>
              {remainingMonths > 0 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }}>
                  📆 ~{remainingMonths} mes{remainingMonths === 1 ? '' : 'es'} para terminar
                </span>
              )}
            </div>
          )}
        </div>
        {profile?.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="rounded-lg object-cover shrink-0"
            style={{ width: 56, height: 72 }}
          />
        )}
      </div>

      <div className="px-5 pt-4 pb-6 flex flex-col gap-4">
        {/* Próximo partido */}
        {round ? (
          <div
            className="rounded-[20px] p-4"
            style={{ background: 'var(--surface)', boxShadow: '0 4px 14px oklch(0.42 0.1 155 / 0.1)', border: '2px solid var(--border)' }}
          >
            <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
              📅 Próximo partido · Jornada {round.round_number}
            </div>
            <div className="font-heading text-[17px] font-bold mt-1 capitalize">
              {round.scheduled_date ? formatDate(round.scheduled_date) : 'Fecha por confirmar'}{effectiveTime && ` · ${effectiveTime}`}
            </div>

            {effectiveClub && (
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                📍 {effectiveClub}
              </div>
            )}

            {match && (
              <div className="flex justify-between items-center mt-2.5 rounded-[14px] px-3 py-2.5" style={{ background: 'var(--surface2)' }}>
                <span className="text-[13px] font-bold">{match.team1_p1?.name} / {match.team1_p2?.name}</span>
                <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted2)' }}>VS</span>
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
                href={`/apuestas/${round.id}`}
                className="flex-1 text-center text-xs font-bold py-2 rounded-xl transition hover:opacity-90"
                style={{ background: 'var(--surface2)', color: 'var(--accent)' }}
              >
                🎰 Apuestas{bettingContext && bettingContext.openMarketsCount > 0 ? ` · ${bettingContext.chipsLeft}/100` : ''}
              </Link>
            </div>
          </div>
        ) : !seasonId ? (
          <Link
            href="/liga"
            className="block rounded-[20px] p-4 text-center transition hover:opacity-90"
            style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}
          >
            <p className="font-heading font-bold text-sm">⚡ Aún no has creado la liga</p>
            <p className="text-xs mt-1">Toca aquí para configurarla desde Calendario.</p>
          </Link>
        ) : (
          <div className="rounded-[20px] p-4 text-sm text-center" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '2px solid var(--border)' }}>
            No hay próximas jornadas programadas.{' '}
            <Link href="/liga" className="font-bold" style={{ color: 'var(--accent)' }}>Ir a Calendario →</Link>
          </div>
        )}

        {/* Saldo de la jornada + ranking acumulado de apuestas */}
        {seasonId && (
          <Link
            href="/liga?tab=apuestas"
            className="rounded-2xl py-3 px-4 flex items-center justify-between gap-3 transition hover:opacity-90"
            style={{ background: 'var(--yellow)', color: 'var(--yellow-text)' }}
          >
            <div>
              <p className="font-heading font-extrabold text-sm">💰 Apuestas</p>
              <p className="text-xs mt-0.5">
                {bettingContext && bettingContext.openMarketsCount > 0
                  ? `Te quedan ${bettingContext.chipsLeft}/100 fichas esta jornada`
                  : 'Ir al mercado de apuestas'}
              </p>
            </div>
            {topBettor && (
              <div className="text-right shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">Va primero</p>
                <p className="text-xs font-extrabold">{topBettor.name} · {topBettor.points}pt</p>
              </div>
            )}
          </Link>
        )}

        {/* Clasificación individual top 4 */}
        <div>
          <Link href="/liga?tab=clasificacion" className="font-heading text-sm font-bold mb-2 flex items-center gap-1 hover:opacity-80">
            🏆 Clasificación individual <span style={{ color: 'var(--text-muted2)' }}>→</span>
          </Link>
          <div className="rounded-[18px] px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 4px 14px rgba(0,0,0,0.04)' }}>
            {!!topIndividual.length && (
              <div className="flex justify-between items-center pt-2" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span>Jugador</span>
                <span className="flex items-center gap-4">
                  <span>Pts</span>
                  <span className="flex items-center gap-1">🌡️ Cena <DinnerRiskInfo /></span>
                </span>
              </div>
            )}
            {topIndividual.map((row, i) => {
              const risk = dinnerRisk[row.player_id]
              return (
                <div
                  key={row.player_id}
                  className="flex justify-between items-center py-2.5"
                  style={{ borderBottom: i < topIndividual.length - 1 ? '1px solid var(--hairline)' : undefined }}
                >
                  <span className="text-[13px] font-bold">{MEDALS[i]} {row.name}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-[13px] font-extrabold w-6 text-right" style={{ color: 'var(--accent)' }}>{row.total_points}</span>
                    {risk && (
                      <span
                        className="flex items-center justify-center w-[34px] h-[26px] rounded-full text-[14px]"
                        style={{ background: risk.color }}
                        title={risk.label}
                        aria-label={`Riesgo de pagar la cena: ${risk.label}`}
                      >
                        {risk.emoji}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
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
