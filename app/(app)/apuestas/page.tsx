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
    <div className="px-5 pt-5 pb-6 flex flex-col gap-6">
      <h1 className="font-heading text-[22px] font-extrabold">💰 Apuestas</h1>

      {/* Clasificación apostadores */}
      <section>
        <h2 className="font-heading text-sm font-bold mb-2.5">Ranking de apostadores</h2>
        <div className="rounded-2xl px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          {ranking.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Aún no hay apuestas resueltas
            </div>
          ) : (
            ranking.map((r, i) => (
              <div
                key={r.player_id}
                className="flex items-center justify-between py-2.5"
                style={{ borderBottom: i < ranking.length - 1 ? '1px solid var(--hairline)' : undefined }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-bold w-5 text-center text-sm" style={{
                    color: i === 0 ? 'var(--yellow)' : 'var(--text-muted2)'
                  }}>
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-bold">{r.name}</span>
                  {r.player_id === user?.id && (
                    <span className="text-xs" style={{ color: 'var(--accent)' }}>(tú)</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span style={{ color: r.chips_total >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {r.chips_total >= 0 ? '+' : ''}{r.chips_total}🎰
                  </span>
                  <span className="font-bold" style={{ color: 'var(--accent)' }}>+{r.total_bonus}pt</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Ir a jornada */}
      <section>
        <h2 className="font-heading text-sm font-bold mb-2.5">Por jornada</h2>
        <div className="flex flex-col gap-2">
          {(rounds ?? []).map(r => (
            <Link
              key={r.id}
              href={`/apuestas/${r.id}`}
              className="flex items-center justify-between rounded-2xl px-4 py-3 transition hover:opacity-90"
              style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
            >
              <span className="text-[13px] font-bold">Jornada {r.round_number}</span>
              <div className="flex items-center gap-2 text-xs">
                <span style={{ color: r.status === 'played' ? 'var(--green)' : 'var(--text-muted)' }}>
                  {r.status === 'played' ? 'Resuelta' : 'Activa'}
                </span>
                <span style={{ color: 'var(--text-muted2)' }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
