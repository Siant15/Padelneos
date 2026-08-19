import { createClient } from '@/lib/supabase/server'
import type { BettingRoundResult, Profile } from '@/lib/types'
import Link from 'next/link'

export default async function ApuestasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Clasificación de apuestas acumulada
  const { data: players } = await supabase.from('profiles').select('id, name')

  const { data: allResults } = await supabase
    .from('betting_round_results')
    .select('*, player:profiles(id, name)')

  // Agrupar por jugador
  type BettingTotal = { player_id: string; name: string; chips_total: number; total_bonus: number; rounds: number }
  const totals: Record<string, BettingTotal> = {}

  for (const r of (allResults as BettingRoundResult[] | null) ?? []) {
    if (!totals[r.player_id]) {
      totals[r.player_id] = {
        player_id: r.player_id,
        name: (r.player as Profile)?.name ?? '?',
        chips_total: 0,
        total_bonus: 0,
        rounds: 0,
      }
    }
    totals[r.player_id].chips_total += r.chips_net
    totals[r.player_id].total_bonus += r.point_bonus
    totals[r.player_id].rounds++
  }

  const ranking = Object.values(totals).sort((a, b) => b.chips_total - a.chips_total)

  // Últimas jornadas con apuestas
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, round_number, scheduled_date, status')
    .order('scheduled_date', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6 pb-4">
      <h1 className="text-xl font-bold">Apuestas 🎰</h1>

      {/* Clasificación apostadores */}
      <section>
        <h2 className="font-semibold mb-3">Ranking de apostadores</h2>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {ranking.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Aún no hay apuestas resueltas
            </div>
          ) : (
            ranking.map((r, i) => (
              <div
                key={r.player_id}
                className="flex items-center justify-between px-4 py-3"
                style={{
                  background: r.player_id === user?.id ? 'var(--surface2)' : 'var(--surface)',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold w-6 text-center" style={{
                    color: i === 0 ? 'var(--yellow)' : 'var(--text-muted)'
                  }}>
                    {i + 1}
                  </span>
                  <span className="font-medium">{r.name}</span>
                  {r.player_id === user?.id && (
                    <span className="text-xs" style={{ color: 'var(--accent)' }}>(tú)</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span style={{ color: r.chips_total >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {r.chips_total >= 0 ? '+' : ''}{r.chips_total}🎰
                  </span>
                  <span style={{ color: 'var(--accent)' }}>+{r.total_bonus}pt</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Ir a jornada */}
      <section>
        <h2 className="font-semibold mb-3">Por jornada</h2>
        <div className="space-y-2">
          {(rounds ?? []).map(r => (
            <Link
              key={r.id}
              href={`/apuestas/${r.id}`}
              className="flex items-center justify-between rounded-xl px-4 py-3 transition hover:opacity-90"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <span className="font-medium">Jornada {r.round_number}</span>
              <div className="flex items-center gap-2 text-sm">
                <span style={{ color: r.status === 'played' ? 'var(--green)' : 'var(--text-muted)' }}>
                  {r.status === 'played' ? 'Resuelta' : 'Activa'}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
