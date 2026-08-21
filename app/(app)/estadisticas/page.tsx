import { createClient } from '@/lib/supabase/server'
import type { MatchStat, Profile } from '@/lib/types'
import Link from 'next/link'
import MetricsInfoButton from '@/components/MetricsInfoButton'

export default async function EstadisticasPage() {
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const seasonId = season?.id

  const { data: seasonRounds } = seasonId
    ? await supabase.from('rounds').select('id, court_booker_id').eq('season_id', seasonId)
    : { data: [] as { id: string; court_booker_id: string | null }[] }
  const seasonRoundIds = (seasonRounds ?? []).map(r => r.id)

  // Rey de la Reserva: quién se ha encargado más veces de reservar pista.
  const bookingCounts: Record<string, number> = {}
  for (const r of seasonRounds ?? []) {
    if (!r.court_booker_id) continue
    bookingCounts[r.court_booker_id] = (bookingCounts[r.court_booker_id] ?? 0) + 1
  }

  const [{ data: stats }, { data: players }, { data: matches }] = await Promise.all([
    seasonRoundIds.length
      ? supabase
        .from('match_stats')
        .select('*, player:profiles(id, name), match:matches!inner(id, round_id, round:rounds(round_number))')
        .in('match.round_id', seasonRoundIds)
        .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as MatchStat[] }),
    supabase.from('profiles').select('id, name'),
    seasonRoundIds.length
      ? supabase
        .from('matches')
        .select('winner, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, round:rounds(round_number)')
        .in('round_id', seasonRoundIds)
        .not('winner', 'is', null)
        .order('round_number', { referencedTable: 'rounds', ascending: true })
      : Promise.resolve({ data: [] as { winner: string; team1_p1_id: string; team1_p2_id: string; team2_p1_id: string; team2_p2_id: string }[] }),
  ])

  const reyDeLaReservaId = Object.keys(bookingCounts).length
    ? Object.entries(bookingCounts).reduce((a, b) => (b[1] > a[1] ? b : a))[0]
    : null
  const reyDeLaReserva = reyDeLaReservaId
    ? { name: (players ?? []).find(p => p.id === reyDeLaReservaId)?.name ?? '?', count: bookingCounts[reyDeLaReservaId] }
    : null

  // Rachas: recorremos el historial de cada jugador de más antiguo a más
  // reciente y nos quedamos con la racha actual (positiva o negativa).
  type Streak = { count: number; kind: 'win' | 'loss' }
  const streaks: Record<string, Streak> = {}
  for (const p of players ?? []) {
    let current: Streak | null = null
    for (const m of matches ?? []) {
      const inTeam1 = m.team1_p1_id === p.id || m.team1_p2_id === p.id
      const inTeam2 = m.team2_p1_id === p.id || m.team2_p2_id === p.id
      if (!inTeam1 && !inTeam2) continue
      if (m.winner === 'draw') { current = null; continue }
      const won = (inTeam1 && m.winner === 'team1') || (inTeam2 && m.winner === 'team2')
      const kind: 'win' | 'loss' = won ? 'win' : 'loss'
      if (current && current.kind === kind) current.count++
      else current = { count: 1, kind }
    }
    if (current && current.count >= 2) streaks[p.id] = current
  }
  const streakRows = (players ?? [])
    .filter(p => streaks[p.id])
    .map(p => ({ name: p.name, ...streaks[p.id] }))
    .sort((a, b) => b.count - a.count)

  // Agrupar por jugador
  type Totals = {
    aces: number
    double_faults: number
    bolas_por_3: number
    smash_al_cristal: number
    matches: number
  }

  const totals: Record<string, Totals & { name: string }> = {}

  for (const s of (stats as MatchStat[] | null) ?? []) {
    if (!totals[s.player_id]) {
      totals[s.player_id] = {
        name: (s.player as Profile)?.name ?? '?',
        aces: 0, double_faults: 0, bolas_por_3: 0, smash_al_cristal: 0, matches: 0
      }
    }
    const t = totals[s.player_id]
    t.aces += s.aces
    t.double_faults += s.double_faults
    t.bolas_por_3 += s.bolas_por_3
    t.smash_al_cristal += s.smash_al_cristal
    t.matches++
  }

  const rows = Object.entries(totals).map(([id, t]) => ({ id, ...t }))

  // Motes automáticos según quién lidera cada estadística. Si hay empate
  // en el valor máximo, se corona a todos los empatados (no arbitrariamente
  // al primero del array).
  const nicknames: Record<string, string[]> = {}
  function crownLeader(key: keyof Totals, label: string, requirePositive = true) {
    if (!rows.length) return
    const max = Math.max(...rows.map(r => r[key]))
    if (requirePositive && max <= 0) return
    for (const r of rows.filter(r => r[key] === max)) {
      nicknames[r.id] = [...(nicknames[r.id] ?? []), label]
    }
  }
  crownLeader('aces', '🎯 Rey del Ace')
  crownLeader('smash_al_cristal', '💥 El Cristalero')
  crownLeader('double_faults', '🧈 Manos de Mantequilla')
  if (rows.length > 1) {
    const min = Math.min(...rows.map(r => r.double_faults))
    if (min === 0) {
      for (const r of rows.filter(r => r.double_faults === 0)) {
        nicknames[r.id] = [...(nicknames[r.id] ?? []), '🧱 Muro']
      }
    }
  }

  return (
    <div className="px-5 pt-5 pb-6 flex flex-col gap-6">
      <div>
        <Link href="/liga?tab=clasificacion" className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>← Clasificación</Link>
        <h1 className="font-heading text-[22px] font-extrabold mt-1">📊 Estadísticas</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Curiosidades acumuladas de cada partido: aces, dobles faltas, bolas por 3 y smash al cristal.
        </p>
      </div>

      {/* Rey de la Reserva */}
      {reyDeLaReserva && (
        <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface2)' }}>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--accent)' }}>🏟️ Rey de la Reserva</p>
          <p className="text-xs">
            <strong>{reyDeLaReserva.name}</strong> se ha encargado de reservar pista {reyDeLaReserva.count} {reyDeLaReserva.count === 1 ? 'vez' : 'veces'} esta temporada
          </p>
        </div>
      )}

      {/* Rachas */}
      {streakRows.length > 0 && (
        <section>
          <h2 className="font-heading text-sm font-bold mb-2.5">🔥 Rachas</h2>
          <div className="flex flex-col gap-2">
            {streakRows.map(s => (
              <div
                key={s.name}
                className="rounded-2xl px-4 py-3 flex items-center justify-between"
                style={{
                  background: s.kind === 'win' ? 'var(--green-bg)' : 'var(--orange-bg)',
                  color: s.kind === 'win' ? 'var(--green)' : 'var(--orange)',
                }}
              >
                <span className="font-bold text-sm">{s.kind === 'win' ? '🔥' : '🥶'} {s.name}</span>
                <span className="text-xs font-bold">
                  {s.count} {s.kind === 'win' ? 'victorias' : 'derrotas'} seguidas
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Totales por jugador */}
      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="font-heading text-sm font-bold">Totales acumulados</h2>
          <MetricsInfoButton />
        </div>
        {!rows.length ? (
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            Aquí todavía no hay ni un ace registrado. En cuanto juguéis la primera jornada, esto se llena de motes y récords.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map(r => (
              <div key={r.id} className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-sm">{r.name}</p>
                  <span className="text-xs" style={{ color: 'var(--text-muted2)' }}>{r.matches} partidos</span>
                </div>
                {!!nicknames[r.id]?.length && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {nicknames[r.id].map(n => (
                      <span key={n} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--accent)' }}>
                        {n}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2">
                  <StatBox emoji="🎯" label="Aces" value={r.aces} perMatch={r.matches ? +(r.aces / r.matches).toFixed(1) : 0} />
                  <StatBox emoji="❌" label="DF" value={r.double_faults} perMatch={r.matches ? +(r.double_faults / r.matches).toFixed(1) : 0} />
                  <StatBox emoji="🎱" label="B×3" value={r.bolas_por_3} perMatch={r.matches ? +(r.bolas_por_3 / r.matches).toFixed(1) : 0} />
                  <StatBox emoji="💥" label="SC" value={r.smash_al_cristal} perMatch={r.matches ? +(r.smash_al_cristal / r.matches).toFixed(1) : 0} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Récords */}
      {rows.length > 0 && (
        <section>
          <h2 className="font-heading text-sm font-bold mb-2.5">Récords 🏅</h2>
          <div className="rounded-2xl px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            {[
              { label: '🎯 Más aces', key: 'aces' as const },
              { label: '❌ Más dobles faltas', key: 'double_faults' as const },
              { label: '🎱 Más bolas por 3', key: 'bolas_por_3' as const },
              { label: '💥 Más smash al cristal', key: 'smash_al_cristal' as const },
            ].map(({ label, key }, i) => {
              const max = Math.max(...rows.map(r => r[key]))
              const leaders = rows.filter(r => r[key] === max)
              return (
                <div
                  key={key}
                  className="flex items-center justify-between py-2.5"
                  style={{ borderBottom: i < 3 ? '1px solid var(--hairline)' : undefined }}
                >
                  <span className="text-sm">{label}</span>
                  <div className="text-right">
                    <span className="font-bold text-sm">{leaders.map(l => l.name).join(' / ')}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-muted2)' }}>({max})</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="text-xs" style={{ color: 'var(--text-muted2)' }}>
        DF = Dobles faltas · B×3 = Bolas por 3 · SC = Smash al cristal
      </div>
    </div>
  )
}

function StatBox({ emoji, label, value, perMatch }: { emoji: string; label: string; value: number; perMatch: number }) {
  return (
    <div className="rounded-xl p-2 text-center" style={{ background: 'var(--surface2)' }}>
      <div className="text-base">{emoji}</div>
      <div className="font-extrabold text-base">{value}</div>
      <div className="text-[10px]" style={{ color: 'var(--text-muted2)' }}>{label}</div>
      <div className="text-[10px]" style={{ color: 'var(--text-muted2)' }}>{perMatch}/p</div>
    </div>
  )
}
