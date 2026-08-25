import { createClient, getCachedUser } from '@/lib/supabase/server'
import type { Round } from '@/lib/types'
import { formatDate } from '@/lib/types'
import Link from 'next/link'
import { Calendar, Clock, MapPin, ArrowUp, ArrowDown, Minus, Flame, Snowflake, Flag, Pencil } from 'lucide-react'
import ConfirmCourtButton from '@/components/ConfirmCourtButton'
import ClickableCard from '@/components/ClickableCard'
import StopPropagation from '@/components/StopPropagation'
import DinnerRiskInfo from '@/components/DinnerRiskInfo'
import PiquesCarousel from '@/components/PiquesCarousel'
import { getRoundBettingContext } from '@/lib/betting-queries'
import { getCachedActiveSeason, getCachedSeasonRounds } from '@/lib/supabase/cached'
import { getInicioData } from '@/lib/inicio-data'
import { estimateDinnerRisk } from '@/lib/types'

const MEDALS = ['🥇', '🥈', '🥉']

// 4 tonos (no 6): oscuro→claro→ámbar→coral, calculados sobre la misma
// probabilidad de estimateDinnerRisk — solo cambia cómo se pinta aquí.
function cenaColor(probability: number): string {
  if (probability < 0.25) return 'oklch(0.5 0.11 155)'
  if (probability < 0.5) return 'oklch(0.72 0.1 155)'
  if (probability < 0.75) return 'oklch(0.8 0.14 95)'
  return 'oklch(0.72 0.14 40)'
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const user = await getCachedUser()

  const [{ data: profile }, activeSeasonRow] = await Promise.all([
    user ? supabase.from('profiles').select('name, avatar_url').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    getCachedActiveSeason(),
  ])

  const seasonId = activeSeasonRow?.id
  const rounds = seasonId ? await getCachedSeasonRounds(seasonId) : []

  const nextRound = (rounds.find(r => r.status === 'scheduled') as Round | undefined) ?? null
  const round = nextRound
  const match = round?.match as { team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string } } | undefined
  const effectiveTime = round?.scheduled_time?.slice(0, 5)
  const effectiveClub = round?.club

  // Ninguna de estas tres depende del resultado de las otras dos —
  // se lanzan a la vez en vez de una detrás de otra para no sumar
  // sus latencias de red.
  const [{ rows, piques }, bettingContext, clubMapsRow] = await Promise.all([
    seasonId ? getInicioData(supabase, seasonId) : Promise.resolve({ rows: [], piques: [] }),
    round && user ? getRoundBettingContext(supabase, round.id, user.id) : Promise.resolve(null),
    effectiveClub ? supabase.from('clubs').select('maps_url').eq('name', effectiveClub).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const clubMapsUrl = clubMapsRow?.data?.maps_url ?? null

  const seasonRoundDates = rounds.filter(r => r.status !== 'played').map(r => r.scheduled_date)
  const today = new Date().toISOString().slice(0, 10)
  const remainingJornadas = seasonRoundDates.length
  const futureDates = seasonRoundDates.filter((d): d is string => !!d && d >= today)
  const lastDate = futureDates.at(-1)
  const remainingMonths = lastDate
    ? Math.max(1, Math.round((new Date(lastDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
    : 0

  // El riesgo de cena se calcula sobre los puntos actuales ya resueltos
  // por getInicioData (sport+apuestas ya sumados en `points`) y los
  // emparejamientos que quedan por jugar.
  const remainingPairings = rounds
    .filter(r => r.status === 'scheduled')
    .map(r => {
      const m = r.match as { team1_p1?: { id: string }; team1_p2?: { id: string }; team2_p1?: { id: string }; team2_p2?: { id: string } } | null
      if (!m?.team1_p1?.id || !m.team1_p2?.id || !m.team2_p1?.id || !m.team2_p2?.id) return null
      return { pair1: [m.team1_p1.id, m.team1_p2.id] as [string, string], pair2: [m.team2_p1.id, m.team2_p2.id] as [string, string] }
    })
    .filter((x): x is { pair1: [string, string]; pair2: [string, string] } => !!x)
  const risk = estimateDinnerRisk(rows.map(r => ({ id: r.id, sportPoints: r.points, bettingBonus: 0 })), remainingPairings)

  return (
    <div className="flex flex-col px-5 pt-4 pb-6 gap-4">
      {/* Saludo + duración de temporada */}
      <div className="flex items-center justify-between">
        <span className="font-heading text-lg font-bold">Hola, {profile?.name ?? '...'}</span>
        {seasonId && (
          <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
            {remainingJornadas} jornada{remainingJornadas === 1 ? '' : 's'}{remainingMonths > 0 ? ` · ~${remainingMonths} mes${remainingMonths === 1 ? '' : 'es'}` : ''}
          </span>
        )}
      </div>

      {/* Próximo partido */}
      {round ? (
        <ClickableCard
          href={`/admin/jornadas/${round.id}/editar`}
          className="relative overflow-hidden rounded-[22px] p-4 text-white"
          style={{ background: 'oklch(0.4 0.09 155)' }}
        >
          <div className="relative flex flex-col gap-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide opacity-90">Próximo partido</p>

            <div className="flex items-center gap-3 text-xs font-bold opacity-95">
              <span className="flex items-center gap-1"><Calendar size={13} /> J{round.round_number} <Pencil size={11} className="opacity-80" /></span>
              <span className="flex items-center gap-1"><Clock size={13} /> {round.scheduled_date ? formatDate(round.scheduled_date).split(',')[0] : '-'} · {effectiveTime || '-'}</span>
            </div>
            <p className="text-xs flex items-center gap-1 -mt-1.5 opacity-90">
              <MapPin size={13} /> {effectiveClub || '-'}
              {clubMapsUrl && (
                <StopPropagation>
                  <a href={clubMapsUrl} target="_blank" rel="noopener noreferrer" className="underline font-bold">
                    Ver en Maps
                  </a>
                </StopPropagation>
              )}
            </p>
            <p className="text-xs -mt-1.5 opacity-90">
              Responsable (reserva y pelotas): {round.court_booker?.name ?? '-'}
            </p>

            {match && (
              <div className="flex items-center justify-center gap-3 py-1">
                <div className="flex-1 text-center">
                  <p className="font-heading font-bold text-[15px] leading-tight">{match.team1_p1?.name}</p>
                  <p className="font-heading font-bold text-[15px] leading-tight">{match.team1_p2?.name}</p>
                </div>
                <span
                  className="flex items-center justify-center rounded-full text-[11px] font-extrabold shrink-0"
                  style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.16)' }}
                >
                  vs
                </span>
                <div className="flex-1 text-center">
                  <p className="font-heading font-bold text-[15px] leading-tight">{match.team2_p1?.name}</p>
                  <p className="font-heading font-bold text-[15px] leading-tight">{match.team2_p2?.name}</p>
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <span
                className="text-[11px] font-extrabold px-3 py-1 rounded-full"
                style={{
                  background: round.court_confirmed ? 'rgba(255,255,255,0.16)' : 'oklch(0.85 0.15 95)',
                  color: round.court_confirmed ? '#fff' : 'oklch(0.32 0.08 70)',
                }}
              >
                {round.court_confirmed ? 'Reserva confirmada' : `Reserva pendiente · ${round.court_booker?.name ?? 'sin asignar'}`}
              </span>
            </div>

            {!round.court_confirmed && round.court_booker_id === user?.id && (
              <StopPropagation>
                <ConfirmCourtButton roundId={round.id} />
              </StopPropagation>
            )}

            <StopPropagation>
              <div className="flex gap-2 mt-1">
                <Link
                  href={`/admin/jornadas/${round.id}/resultado`}
                  className="flex-1 text-center text-sm font-bold py-2.5 rounded-xl transition hover:opacity-90"
                  style={{ background: '#fff', color: 'oklch(0.4 0.09 155)' }}
                >
                  Resultado
                </Link>
                <Link
                  href={`/liga?tab=apuestas&round=${round.id}`}
                  className="flex-1 text-center text-sm font-bold py-2.5 rounded-xl transition hover:opacity-90 flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}
                >
                  Apostar · {bettingContext?.chipsLeft ?? 100} fichas
                </Link>
              </div>
            </StopPropagation>
          </div>
        </ClickableCard>
      ) : !seasonId ? (
        <Link
          href="/liga"
          className="block rounded-[20px] p-4 text-center transition hover:opacity-90"
          style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}
        >
          <p className="font-heading font-bold text-sm">Aún no has creado la liga</p>
          <p className="text-xs mt-1">Toca aquí para configurarla desde Calendario.</p>
        </Link>
      ) : (
        <div className="rounded-[20px] p-4 text-sm text-center" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '2px solid var(--border)' }}>
          No hay próximas jornadas programadas.{' '}
          <Link href="/liga" className="font-bold" style={{ color: 'var(--accent)' }}>Ir a Calendario →</Link>
        </div>
      )}

      {/* Clasificación individual */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Link href="/liga?tab=clasificacion" className="font-heading text-sm font-bold hover:opacity-80">Clasificación individual</Link>
          <Link href="/liga?tab=clasificacion" className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Ver todo →</Link>
        </div>
        <div className="rounded-[18px] px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 4px 14px rgba(0,0,0,0.04)' }}>
          {!!rows.length && (
            <div className="grid items-center pt-2.5 pb-1.5" style={{ gridTemplateColumns: '1.5fr 0.6fr 1fr 0.8fr', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Jugador</span>
              <span className="text-right">Pts</span>
              <span className="text-center">Racha</span>
              <span className="flex items-center justify-end gap-1">Cena <DinnerRiskInfo /></span>
            </div>
          )}
          {rows.map((row, i) => {
            const r = risk[row.id]
            return (
              <div
                key={row.id}
                className="grid items-center py-2.5"
                style={{
                  gridTemplateColumns: '1.5fr 0.6fr 1fr 0.8fr',
                  borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : undefined,
                  background: row.id === user?.id ? 'var(--green-bg)' : undefined,
                  marginLeft: -14, marginRight: -14, paddingLeft: 14, paddingRight: 14,
                }}
              >
                <span className="text-[13px] font-bold flex items-center gap-1.5">
                  <span
                    className="flex items-center justify-center rounded-full text-[10px] font-extrabold shrink-0"
                    style={{ width: 18, height: 18, background: row.rank <= 3 ? 'var(--tint)' : undefined }}
                  >
                    {MEDALS[row.rank - 1] ?? row.rank}
                  </span>
                  {row.name}
                  <RankDelta delta={row.rankDelta} />
                </span>
                <span className="text-[13px] font-extrabold text-right" style={{ color: 'var(--accent)' }}>{row.points}</span>
                <span className="flex items-center justify-center">
                  <StreakBadge row={row} />
                </span>
                <span className="flex justify-end">
                  {r && (
                    <span
                      className="rounded-full shrink-0"
                      style={{ width: 16, height: 16, background: cenaColor(r.probability) }}
                      title={r.label}
                      aria-label={`Riesgo de pagar la cena: ${r.label}`}
                    />
                  )}
                </span>
              </div>
            )
          })}
          {!rows.length && (
            <div className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Aún no hay partidos jugados
            </div>
          )}
          {!!rows.length && (
            <p className="text-[10.5px] pb-2.5" style={{ color: 'var(--text-muted2)' }}>Racha · últimos 3 partidos</p>
          )}
        </div>
      </div>

      {/* El pique de la jornada */}
      {piques.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading text-sm font-bold flex items-center gap-1.5">
              <Flame size={15} style={{ color: 'var(--orange)' }} /> El pique de la jornada
            </span>
            <Link href="/piques" className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Ver todos →</Link>
          </div>
          <PiquesCarousel piques={piques} />
        </div>
      )}

      {/* Footer nota */}
      <div
        className="rounded-2xl px-3.5 py-3 text-xs flex items-center gap-2"
        style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}
      >
        <Flag size={14} className="shrink-0" /> Al terminar la liga, 1º y 2º cenan invitados por 3º y 4º.
      </div>
    </div>
  )
}

function RankDelta({ delta }: { delta: number }) {
  if (delta > 0) return <span className="flex items-center text-[11px] font-extrabold" style={{ color: 'var(--green)' }}><ArrowUp size={11} />{delta}</span>
  if (delta < 0) return <span className="flex items-center text-[11px] font-extrabold" style={{ color: 'oklch(0.6 0.19 30)' }}><ArrowDown size={11} />{Math.abs(delta)}</span>
  return <Minus size={11} style={{ color: 'var(--text-muted2)' }} />
}

function StreakBadge({ row }: { row: { activeStreak: { type: 'V' | 'D'; length: number } | null; results: ('V' | 'D')[] } }) {
  if (row.activeStreak && row.activeStreak.length >= 3) {
    const isWin = row.activeStreak.type === 'V'
    return (
      <span
        className="flex items-center gap-1 text-[11px] font-extrabold px-2 py-1 rounded-full"
        style={{ background: isWin ? 'var(--green-bg)' : 'oklch(0.95 0.04 55)', color: isWin ? 'var(--green)' : 'oklch(0.55 0.15 40)' }}
      >
        {isWin ? <Flame size={11} /> : <Snowflake size={11} />} {row.activeStreak.length}{row.activeStreak.type}
      </span>
    )
  }
  if (!row.results.length) return <span className="text-xs" style={{ color: 'var(--text-muted2)' }}>—</span>
  return (
    <span className="flex items-center gap-1">
      {row.results.map((r, i) => (
        <span
          key={i}
          className="flex items-center justify-center rounded-full text-[9px] font-extrabold"
          style={{ width: 16, height: 16, background: r === 'V' ? 'var(--green-bg)' : 'oklch(0.95 0.04 55)', color: r === 'V' ? 'var(--green)' : 'oklch(0.55 0.15 40)' }}
        >
          {r}
        </span>
      ))}
    </span>
  )
}
