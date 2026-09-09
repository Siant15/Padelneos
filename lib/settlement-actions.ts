'use server'

import { getCachedUser } from '@/lib/supabase/server'
import { createPushAdminClient, sendPersonalizedPush } from '@/lib/push'

// Se llama justo después de que `settle_round` (RPC) termine bien —
// cada jugador recibe su propio resultado de la jornada (fichas netas,
// puesto, puntos ganados si tocaba), nunca el de los demás. "A mejor
// esfuerzo": si falla, la liquidación ya quedó hecha de todas formas.
export async function notifySettlementResults(roundId: string): Promise<void> {
  const user = await getCachedUser()
  if (!user) return

  try {
    const admin = createPushAdminClient()
    const { data: round } = await admin.from('rounds').select('round_number').eq('id', roundId).maybeSingle()
    if (!round) return

    const { data: results } = await admin
      .from('betting_round_results')
      .select('player_id, chips_net, rank, point_bonus')
      .eq('round_id', roundId)

    if (!results?.length) return

    const items = results.map(r => {
      const netLabel = r.chips_net > 0 ? `+${r.chips_net}` : `${r.chips_net}`
      const pointsLabel = r.point_bonus > 0 ? ` · +${r.point_bonus}pt` : ''
      return {
        playerId: r.player_id,
        payload: {
          title: `🏆 Jornada ${round.round_number} liquidada`,
          body: `${netLabel} fichas${pointsLabel} · ${r.rank}º de la jornada`,
          url: '/liga?tab=apuestas',
        },
      }
    })

    await sendPersonalizedPush(admin, items)
  } catch {
    // best-effort, no bloquea la liquidación
  }
}
