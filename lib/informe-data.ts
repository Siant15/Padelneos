import { createClient } from '@/lib/supabase/server'
import { getCachedPlayers, getCachedSeasonRounds } from '@/lib/supabase/cached'
import { computeInforme, halfSeasonReached, type InformeEvent, type InformePlayer, type InformeTitle } from '@/lib/informe'

export type InformeData = {
  titles: InformeTitle[]
  roundsPlayed: number
  roundsTotal: number
  halfReached: boolean
}

// Reúne lo necesario del informe: victorias/derrotas de cada jugador y, de las
// preguntas "primero en…" ya resueltas esta temporada, quién fue el protagonista.
export async function getInformeData(seasonId: string): Promise<InformeData> {
  const supabase = await createClient()
  const [players, rounds, { data: standings }, { data: markets }, { data: templates }] = await Promise.all([
    getCachedPlayers(),
    getCachedSeasonRounds(seasonId),
    supabase.from('individual_standings').select('player_id, wins, losses').eq('season_id', seasonId),
    supabase
      .from('betting_markets')
      .select('template_id, winning_option_id')
      .eq('season_id', seasonId)
      .eq('resolved', true)
      .eq('voided', false)
      .eq('type', 'player')
      .not('winning_option_id', 'is', null),
    supabase.from('betting_question_templates').select('id, text, allow_self_bet'),
  ])

  const winningIds = [...new Set((markets ?? []).map(m => m.winning_option_id).filter((id): id is string => !!id))]
  const { data: options } = winningIds.length
    ? await supabase.from('betting_options').select('id, player_id').in('id', winningIds)
    : { data: [] as { id: string; player_id: string | null }[] }

  const playerByOption = new Map((options ?? []).map(o => [o.id, o.player_id]))
  const templateById = new Map((templates ?? []).map(t => [t.id, t]))

  const events: InformeEvent[] = []
  for (const m of markets ?? []) {
    const playerId = m.winning_option_id ? playerByOption.get(m.winning_option_id) : null
    const template = m.template_id ? templateById.get(m.template_id) : null
    // "Ninguno" no tiene jugador: no suma a nadie. Las preguntas sin plantilla tampoco.
    if (!playerId || !template) continue
    events.push({ playerId, templateText: template.text, positive: !!template.allow_self_bet })
  }

  const statsByPlayer = new Map((standings ?? []).map(s => [s.player_id, s]))
  const informePlayers: InformePlayer[] = players.map(p => ({
    id: p.id,
    name: p.name,
    wins: statsByPlayer.get(p.id)?.wins ?? 0,
    losses: statsByPlayer.get(p.id)?.losses ?? 0,
  }))

  const roundsTotal = rounds.filter(r => r.status !== 'cancelled').length
  const roundsPlayed = rounds.filter(r => r.status === 'played').length
  return {
    titles: computeInforme(informePlayers, events),
    roundsPlayed,
    roundsTotal,
    halfReached: halfSeasonReached(roundsPlayed, roundsTotal),
  }
}
