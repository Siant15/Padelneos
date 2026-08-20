import { createClient } from '@/lib/supabase/server'
import type { BettingRoundResult, Profile } from '@/lib/types'
import Link from 'next/link'

export default async function ApuestasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Clasificación de apuestas acumulada
  const { data: players } = await supabase.from('profiles').select('id, name')

  const { data: allResults, error: resultsError } = await supabase
    .from('betting_round_results')
    .select('*, player:profiles(id, name)')
  if (resultsError) console.error('apuestas: error al leer betting_round_results', resultsError)

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

  // "Nostradamus": racha de jornadas seguidas quedando 1º en apuestas
  const { data: resultsChrono } = await supabase
    .from('betting_round_results')
    .select('player_id, rank, player:profiles(id, name), round:rounds(scheduled_date)')
    .order('scheduled_date', { referencedTable: 'round', ascending: true })

  let nostradamus: { name: string; count: number } | null = null
  for (const p of (players as { id: string; name: string }[] | null) ?? []) {
    let streak = 0
    for (const r of (resultsChrono as { player_id: string; rank: number }[] | null) ?? []) {
      if (r.player_id !== p.id) continue
      if (r.rank === 1) streak++
      else streak = 0
    }
    if (streak >= 2 && (!nostradamus || streak > nostradamus.count)) {
      nostradamus = { name: p.name, count: streak }
    }
  }

  // Apuesta más arriesgada de la historia
  const { data: biggestBet } = await supabase
    .from('bets')
    .select('chips, player:profiles(name), option:betting_options(id, label, market:betting_markets(winning_option_id, resolved))')
    .order('chips', { ascending: false })
    .limit(1)
    .maybeSingle()

  type BiggestBet = { chips: number; player: { name: string } | null; option: { id: string; label: string; market: { winning_option_id: string | null; resolved: boolean } | null } | null }
  const bb = biggestBet as BiggestBet | null
  const biggestBetWon = bb?.option?.market?.resolved ? bb.option.id === bb.option.market.winning_option_id : null

  // Últimas jornadas con apuestas
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id, round_number, scheduled_date, status')
    .order('scheduled_date', { ascending: false })
    .limit(10)

  const roundIds = (rounds ?? []).map(r => r.id)
  const { data: marketsByRound } = roundIds.length
    ? await supabase.from('betting_markets').select('round_id, resolved').in('round_id', roundIds)
    : { data: [] as { round_id: string; resolved: boolean }[] }

  function bettingStatus(roundId: string) {
    const markets = (marketsByRound ?? []).filter(m => m.round_id === roundId)
    if (!markets.length) return { label: 'Sin mercados aún', color: 'var(--text-muted2)' }
    if (markets.every(m => m.resolved)) return { label: 'Resuelta', color: 'var(--green)' }
    return { label: 'Activa', color: 'var(--orange)' }
  }

  return (
    <div className="px-5 pt-5 pb-6 flex flex-col gap-6">
      <h1 className="font-heading text-[22px] font-extrabold">💰 Apuestas</h1>

      {/* Nostradamus */}
      {nostradamus && (
        <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface2)' }}>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--accent)' }}>🔮 Nostradamus de la liga</p>
          <p className="text-xs">
            <strong>{nostradamus.name}</strong> lleva {nostradamus.count} jornadas seguidas acertando más que nadie
          </p>
        </div>
      )}

      {/* Apuesta más arriesgada */}
      {bb && (
        <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--yellow)', color: 'var(--yellow-text)' }}>
          <p className="text-xs font-bold mb-1">🎲 La apuesta más loca de la historia</p>
          <p className="text-xs">
            <strong>{bb.player?.name}</strong> se jugó {bb.chips} fichas a &quot;{bb.option?.label}&quot;
            {biggestBetWon === true && ' · y acertó 🏆'}
            {biggestBetWon === false && ' · y falló 💀'}
          </p>
        </div>
      )}

      {/* Clasificación apostadores */}
      <section>
        <h2 className="font-heading text-sm font-bold mb-2.5">Ranking de apostadores</h2>
        <div className="rounded-2xl px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          {ranking.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Todavía nadie ha hecho fortuna (ni se ha arruinado) apostando
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
        {!rounds?.length ? (
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            Aún no hay jornadas creadas, así que no hay mercados de apuestas todavía.
            <br />
            Ve a <Link href="/admin" className="font-bold" style={{ color: 'var(--accent)' }}>Admin</Link> para crear la liga y la primera jornada.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rounds.map(r => {
              const status = bettingStatus(r.id)
              return (
                <Link
                  key={r.id}
                  href={`/apuestas/${r.id}`}
                  className="flex items-center justify-between rounded-2xl px-4 py-3 transition hover:opacity-90"
                  style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
                >
                  <span className="text-[13px] font-bold">Jornada {r.round_number}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span style={{ color: status.color }}>{status.label}</span>
                    <span style={{ color: 'var(--text-muted2)' }}>→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
