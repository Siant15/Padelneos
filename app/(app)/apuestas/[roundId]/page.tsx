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

  const { data: players } = await supabase.from('profiles').select('id, name')

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Apuestas J{round.round_number}</h1>
        {round.status === 'scheduled' && (
          <div
            className="text-sm font-semibold px-3 py-1.5 rounded-xl"
            style={{
              background: chipsLeft > 0 ? 'var(--surface2)' : 'var(--surface)',
              border: '1px solid var(--border)',
              color: chipsLeft > 20 ? 'var(--green)' : chipsLeft > 0 ? 'var(--orange)' : 'var(--red)',
            }}
          >
            🎰 {chipsLeft}/{CHIPS_PER_ROUND} fichas
          </div>
        )}
      </div>

      {/* Resultados finales si ya están resueltos */}
      {bettingResults && bettingResults.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>RESULTADO APUESTAS</p>
          <div className="space-y-2">
            {bettingResults.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
                  <span className="font-medium">{(r.player as Profile)?.name}</span>
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
          className="rounded-xl p-6 text-center text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          Aún no hay mercados de apuestas para esta jornada.
          <br />El administrador los creará antes del partido.
        </div>
      ) : (
        <div className="space-y-4">
          {(markets as BettingMarket[]).map(market => (
            <BettingMarketCard
              key={market.id}
              market={market}
              userId={user?.id ?? ''}
              chipsLeft={chipsLeft}
              roundStatus={round.status}
              players={players as Profile[] ?? []}
            />
          ))}
        </div>
      )}

      <div
        className="rounded-xl p-4 text-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Reglas</p>
        <ul className="space-y-1 text-xs list-disc list-inside">
          <li>100 fichas por jornada para repartir entre predicciones</li>
          <li>Premio pari-mutuel: cuantas menos fichas en el resultado ganador, mayor el premio</li>
          <li>No puedes apostar contra ti mismo (ej: que tú harás doble falta)</li>
          <li>Top 1 → +1 pt clasificación · Top 2 → +0,5 pts</li>
        </ul>
      </div>
    </div>
  )
}
