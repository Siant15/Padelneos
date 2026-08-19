import { createClient } from '@/lib/supabase/server'
import type { MatchStat, Profile } from '@/lib/types'
import Link from 'next/link'

export default async function EstadisticasPage() {
  const supabase = await createClient()

  const { data: stats } = await supabase
    .from('match_stats')
    .select('*, player:profiles(id, name), match:matches(id, round:rounds(round_number))')
    .order('created_at', { ascending: false })

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
    <div className="px-5 pt-5 pb-6 flex flex-col gap-6">
      <div>
        <Link href="/clasificacion" className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>← Clasificación</Link>
        <h1 className="font-heading text-[22px] font-extrabold mt-1">📊 Estadísticas</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Curiosidades acumuladas de cada partido: aces, dobles faltas, bolas por 3 y smash al cristal.
        </p>
      </div>

      {/* Totales por jugador */}
      <section>
        <h2 className="font-heading text-sm font-bold mb-2.5">Totales acumulados</h2>
        {!rows.length ? (
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            Aún no hay estadísticas registradas. Se rellenan al meter el resultado de cada jornada.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map(r => (
              <div key={r.id} className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="font-bold text-sm">{r.name}</p>
                  <span className="text-xs" style={{ color: 'var(--text-muted2)' }}>{r.matches} partidos</span>
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
          <h2 className="font-heading text-sm font-bold mb-2.5">Récords 🏅</h2>
          <div className="rounded-2xl px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
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
                  className="flex items-center justify-between py-2.5"
                  style={{ borderBottom: i < 3 ? '1px solid var(--hairline)' : undefined }}
                >
                  <span className="text-sm">{label}</span>
                  <div className="text-right">
                    <span className="font-bold text-sm">{leader.name}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-muted2)' }}>({leader[key]})</span>
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
