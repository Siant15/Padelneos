import { createClient } from '@/lib/supabase/server'
import type { BettingQuestionTemplate } from '@/lib/types'
import MercadosClient, { type MarketWithAll } from './MercadosClient'

export default async function MercadosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params
  const supabase = await createClient()

  const [{ data: m, error: marketsError }, { data: r, error: roundError }, { data: settlement }, { data: allTemplates }, { data: usageRows }] = await Promise.all([
    supabase.from('betting_markets')
      .select('*, options:betting_options!market_id(*, player:profiles(id, name)), bets(*), template:betting_question_templates(*)')
      .eq('round_id', roundId)
      .order('created_at'),
    supabase.from('rounds').select('status, round_number, season_id').eq('id', roundId).single(),
    supabase.from('round_settlements').select('id').eq('round_id', roundId).is('voided_at', null).maybeSingle(),
    supabase.from('betting_question_templates').select('*').eq('active', true).order('text'),
    supabase.from('betting_markets').select('template_id').not('template_id', 'is', null),
  ])

  const marketRows = (m as MarketWithAll[]) ?? []

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
