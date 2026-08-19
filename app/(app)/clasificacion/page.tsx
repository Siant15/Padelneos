import { createClient } from '@/lib/supabase/server'
import type { IndividualStanding, PairStanding } from '@/lib/types'

export default async function ClasificacionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: individual }, { data: pairs }] = await Promise.all([
    supabase.from('individual_standings').select('*'),
    supabase.from('pair_standings').select('*'),
  ])

  return (
    <div className="space-y-8 pb-4">
      <h1 className="text-xl font-bold">Clasificación</h1>

      {/* Individual */}
      <section>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <span>👤</span> Individual
        </h2>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {/* Header */}
          <div className="grid grid-cols-[2rem_1fr_3rem_3rem_3rem_4rem] px-4 py-2 text-xs font-semibold"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
            <span>#</span>
            <span>Jugador</span>
            <span className="text-center">PJ</span>
            <span className="text-center">V/E/D</span>
            <span className="text-center">🎰</span>
            <span className="text-right">Total</span>
          </div>
          {(individual as IndividualStanding[] | null)?.map((s, i) => (
            <div
              key={s.player_id}
              className="grid grid-cols-[2rem_1fr_3rem_3rem_3rem_4rem] items-center px-4 py-3"
              style={{
                background: s.player_id === user?.id ? 'var(--surface2)' : 'var(--surface)',
                borderTop: '1px solid var(--border)',
              }}
            >
              <span className="font-bold" style={{
                color: i === 0 ? 'var(--yellow)' : i === 1 ? '#94a3b8' : 'var(--text-muted)'
              }}>
                {i + 1}
              </span>
              <span className="font-medium truncate">
                {s.name}
                {s.player_id === user?.id && (
                  <span className="ml-1 text-xs" style={{ color: 'var(--accent)' }}>(tú)</span>
                )}
              </span>
              <span className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>{s.matches_played}</span>
              <span className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                {s.wins}/{s.draws}/{s.losses}
              </span>
              <span className="text-center text-sm" style={{ color: 'var(--accent)' }}>
                +{s.betting_bonus}
              </span>
              <span className="text-right font-bold">{s.total_points}</span>
            </div>
          ))}
          {!individual?.length && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Aún no hay partidos jugados
            </div>
          )}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Victoria=2 pts · Empate=1 pt · 🎰 bonus apuestas (max 1pt/jornada)
        </p>
      </section>

      {/* Parejas */}
      <section>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <span>👥</span> Parejas
        </h2>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-[2rem_1fr_3rem_3rem_4rem] px-4 py-2 text-xs font-semibold"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
            <span>#</span>
            <span>Pareja</span>
            <span className="text-center">PJ</span>
            <span className="text-center">V/E/D</span>
            <span className="text-right">Pts</span>
          </div>
          {(pairs as PairStanding[] | null)?.map((p, i) => (
            <div
              key={p.pair_key}
              className="grid grid-cols-[2rem_1fr_3rem_3rem_4rem] items-center px-4 py-3"
              style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
            >
              <span className="font-bold" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
              <span className="text-sm font-medium">{p.p1_name} & {p.p2_name}</span>
              <span className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>{p.matches_played}</span>
              <span className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                {p.wins}/{p.draws}/{p.losses}
              </span>
              <span className="text-right font-bold">{p.points}</span>
            </div>
          ))}
          {!pairs?.length && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Aún no hay partidos jugados
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
