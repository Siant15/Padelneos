import { createClient } from '@/lib/supabase/server'
import type { MatchStat, Profile } from '@/lib/types'

export default async function EstadisticasPage() {
  const supabase = await createClient()

  const { data: stats } = await supabase
    .from('match_stats')
    .select('*, player:profiles(id, name), match:matches(id, round:rounds(round_number))')
    .order('created_at', { ascending: false })

  const { data: players } = await supabase.from('profiles').select('id, name')

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

  return (
    <div className="space-y-6 pb-4">
      <h1 className="text-xl font-bold">Estadísticas</h1>

      {/* Totales por jugador */}
      <section>
        <h2 className="font-semibold mb-3">Totales acumulados</h2>
        {!rows.length ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aún no hay estadísticas registradas.</p>
        ) : (
          <div className="space-y-3">
            {rows.map(r => (
              <div
                key={r.id}
                className="rounded-xl p-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold">{r.name}</p>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.matches} partidos</span>
                </div>
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
          <h2 className="font-semibold mb-3">Récords 🏅</h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {[
              { label: '🎯 Más aces', key: 'aces' as const },
              { label: '❌ Más dobles faltas', key: 'double_faults' as const },
              { label: '🎱 Más bolas por 3', key: 'bolas_por_3' as const },
              { label: '💥 Más smash al cristal', key: 'smash_al_cristal' as const },
            ].map(({ label, key }, i) => {
              const leader = rows.reduce((a, b) => a[key] > b[key] ? a : b)
              return (
                <div
                  key={key}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    background: 'var(--surface)',
                    borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                  }}
                >
                  <span className="text-sm">{label}</span>
                  <div className="text-right">
                    <span className="font-bold">{leader.name}</span>
                    <span className="text-sm ml-2" style={{ color: 'var(--text-muted)' }}>({leader[key]})</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        DF = Dobles faltas · B×3 = Bolas por 3 · SC = Smash al cristal
      </div>
    </div>
  )
}

function StatBox({ emoji, label, value, perMatch }: { emoji: string; label: string; value: number; perMatch: number }) {
  return (
    <div
      className="rounded-lg p-2 text-center"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
    >
      <div className="text-lg">{emoji}</div>
      <div className="font-bold text-lg">{value}</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{perMatch}/p</div>
    </div>
  )
}
