import { createClient } from '@/lib/supabase/server'
import type { BettingQuestionTemplate } from '@/lib/types'
import MercadosClient, { type MarketWithAll } from './MercadosClient'

export default async function MercadosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params
  const supabase = await createClient()

  // El total de fichas por opción se pide con el resto en paralelo (no
  // después, en serie) vía una función que solo devuelve la suma (nunca
  // quién apostó qué) — así se puede ver "cuánto hay en juego" en una
  // pregunta todavía sin resolver sin exponer las apuestas individuales
  // de los demás jugadores antes de que cierre el mercado.
  const [{ data: m, error: marketsError }, { data: r, error: roundError }, { data: settlement }, { data: allTemplates }, { data: usageRows }, { data: betTotalsRows }] = await Promise.all([
    supabase.from('betting_markets')
      .select('*, options:betting_options!market_id(*, player:profiles(id, name)), template:betting_question_templates(*)')
      .eq('round_id', roundId)
      .order('created_at'),
    supabase.from('rounds').select('status, round_number, season_id').eq('id', roundId).single(),
    supabase.from('round_settlements').select('id').eq('round_id', roundId).is('voided_at', null).maybeSingle(),
    supabase.from('betting_question_templates').select('*').eq('active', true).order('text'),
    supabase.from('betting_markets').select('template_id').not('template_id', 'is', null),
    supabase.rpc('get_round_bet_totals', { p_round_id: roundId }),
  ])

  const marketRows = (m as MarketWithAll[]) ?? []

  for (const market of marketRows) {
    market.betTotals = {}
    for (const row of betTotalsRows ?? []) {
      if (row.market_id === market.id) market.betTotals[row.option_id] = row.chips
    }
  }

  const usageCount: Record<string, number> = {}
  for (const row of usageRows ?? []) {
    if (row.template_id) usageCount[row.template_id] = (usageCount[row.template_id] ?? 0) + 1
  }
  const usedTemplateIds = new Set(marketRows.map(mr => mr.template_id).filter(Boolean))
  const catalog = ((allTemplates as BettingQuestionTemplate[]) ?? [])
    .filter(t => !usedTemplateIds.has(t.id))
    .sort((a, b) => (usageCount[b.id] ?? 0) - (usageCount[a.id] ?? 0))

  return (
    <MercadosClient
      roundId={roundId}
      initialMarkets={marketRows}
      initialCatalog={catalog}
      initialRoundStatus={r?.status ?? ''}
      initialIsSettled={!!settlement}
      initialLoadError={
        marketsError ? 'No se pudieron cargar las apuestas: ' + marketsError.message :
        roundError ? 'No se pudo cargar el estado de la jornada: ' + roundError.message : ''
      }
    />
  )
}
