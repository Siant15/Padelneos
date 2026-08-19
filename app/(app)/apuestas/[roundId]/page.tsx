import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BettingMarketCard from '@/components/BettingMarketCard'
import type { BettingMarket, Profile } from '@/lib/types'

const CHIPS_PER_ROUND = 100

export default async function ApuestasPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number, scheduled_date, status')
    .eq('id', roundId)
    .single()

  if (!round) notFound()

  const { data: markets } = await supabase
    .from('betting_markets')
    .select('*, options:betting_options(*, player:profiles(id, name)), bets(*)')
    .eq('round_id', roundId)
    .order('created_at')

  // Fichas ya apostadas por el usuario en esta jornada
  const chipsUsed = (markets as BettingMarket[] | null)?.reduce((sum, m) => {
    const myBets = m.bets?.filter(b => b.player_id === user?.id) ?? []
    return sum + myBets.reduce((s, b) => s + b.chips, 0)
  }, 0) ?? 0

  const chipsLeft = CHIPS_PER_ROUND - chipsUsed

  // Resultados de apuestas si la jornada está jugada
  const { data: bettingResults } = await supabase
    .from('betting_round_results')
    .select('*, player:profiles(id, name)')
    .eq('round_id', roundId)
    .order('rank')

  return (
    <div className="px-5 pt-5 pb-6 flex flex-col gap-3.5">
      <div
        className="rounded-2xl px-3.5 py-3 flex justify-between items-center"
        style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
      >
        <div>
          <div className="text-[11px] font-extrabold" style={{ color: 'var(--accent)' }}>MERCADO · JORNADA {round.round_number}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted2)' }}>100 fichas/jugador</div>
        </div>
        {round.status === 'scheduled' && (
          <div
            className="text-xs font-bold px-3 py-1.5 rounded-xl"
            style={{
              background: 'var(--tint)',
              color: chipsLeft > 20 ? 'var(--green)' : chipsLeft > 0 ? 'var(--orange)' : 'var(--red)',
            }}
          >
            🎰 {chipsLeft}/{CHIPS_PER_ROUND}
          </div>
        )}
      </div>

      {/* Resultados finales si ya están resueltos */}
      {bettingResults && bettingResults.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <p className="text-xs font-extrabold mb-3" style={{ color: 'var(--text-muted2)' }}>RESULTADO APUESTAS</p>
          <div className="space-y-2">
            {bettingResults.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
                  <span className="font-bold">{(r.player as Profile)?.name}</span>
                  {r.player_id === user?.id && <span className="text-xs" style={{ color: 'var(--accent)' }}>(tú)</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: r.chips_net >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {r.chips_net >= 0 ? '+' : ''}{r.chips_net} fichas
                  </span>
                  {r.point_bonus > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>
                      +{r.point_bonus} pt
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mercados */}
      {!markets?.length ? (
        <div
          className="rounded-2xl p-6 text-center text-sm"
          style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
        >
          Aún no hay mercados de apuestas para esta jornada.
          <br />
          Créalos desde{' '}
          <a href={`/admin/jornadas/${roundId}/mercados`} className="font-bold" style={{ color: 'var(--accent)' }}>
            Admin → Mercados
          </a>.
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {(markets as BettingMarket[]).map(market => (
            <BettingMarketCard
              key={market.id}
              market={market}
              userId={user?.id ?? ''}
              chipsLeft={chipsLeft}
              roundStatus={round.status}
            />
          ))}
        </div>
      )}

      <div
        className="rounded-2xl px-3.5 py-3 text-xs"
        style={{ background: 'var(--surface2)', color: '#3A5FC4' }}
      >
        ⚖️ Menos fichas en el resultado ganador = mayor premio. No puedes apostar en contra de ti mismo.
      </div>
    </div>
  )
}
