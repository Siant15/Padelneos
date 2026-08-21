import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BettingMarketsBoard from '@/components/BettingMarketsBoard'
import AddQuestionPicker from '@/components/AddQuestionPicker'
import ApuestasActa from '@/components/ApuestasActa'
import { JornadaHeader } from '@/components/ApuestasTab'
import { getRoundBettingContext, getRoundActa } from '@/lib/betting-queries'
import { CHIPS_PER_ROUND } from '@/lib/betting'

export default async function ApuestasPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const ctx = await getRoundBettingContext(supabase, roundId, user?.id ?? '')
  if (!ctx.round) notFound()
  const round = ctx.round
  const markets = ctx.markets

  if (ctx.isSettled) {
    const acta = await getRoundActa(supabase, roundId)
    return (
      <div className="px-5 pt-5 pb-6 flex flex-col gap-3.5">
        <JornadaHeader
          roundNumber={round.round_number}
          pair1Label={acta.pair1Label}
          pair2Label={acta.pair2Label}
          scoreLabel={acta.scoreLabel}
          scheduledDate={round.scheduled_date}
          scheduledTime={round.scheduled_time}
          club={acta.round?.club ?? null}
        />
        <ApuestasActa markets={acta.markets} standings={acta.standings} />
      </div>
    )
  }

  const templateIds = [...new Set(markets.map(m => m.template_id).filter((id): id is string => !!id))]
  const [{ data: jackpots }, { data: catalog }] = await Promise.all([
    templateIds.length
      ? supabase.from('jackpots').select('template_id, chips').eq('season_id', round.season_id ?? '').in('template_id', templateIds)
      : Promise.resolve({ data: [] as { template_id: string; chips: number }[] }),
    supabase.from('betting_question_templates').select('*').eq('active', true).order('text'),
  ])

  const jackpotByTemplate: Record<string, number> = {}
  for (const j of jackpots ?? []) jackpotByTemplate[j.template_id] = j.chips

  const usedTemplateIds = new Set(templateIds)
  const availableFromCatalog = (catalog ?? []).filter(t => !usedTemplateIds.has(t.id))

  return (
    <div className="px-5 pt-5 pb-6 flex flex-col gap-3.5">
      <div
        className="rounded-2xl px-3.5 py-3 flex justify-between items-center"
        style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
      >
        <div>
          <div className="text-[11px] font-extrabold" style={{ color: 'var(--accent)' }}>APUESTAS · JORNADA {round.round_number}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted2)' }}>100 fichas/jugador</div>
        </div>
        {round.status === 'scheduled' && (
          <div
            className="text-xs font-bold px-3 py-1.5 rounded-xl"
            style={{
              background: 'var(--tint)',
              color: ctx.chipsLeft > 20 ? 'var(--green)' : ctx.chipsLeft > 0 ? 'var(--orange)' : 'var(--red)',
            }}
          >
            🎰 {ctx.chipsLeft}/{CHIPS_PER_ROUND}
          </div>
        )}
      </div>

      {!markets.length ? (
        <div
          className="rounded-2xl p-6 text-center text-sm"
          style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
        >
          Aún no hay apuestas para esta jornada.
        </div>
      ) : (
        <div className="rounded-2xl px-4 pt-4 pb-1" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <h2 className="font-heading font-bold text-sm mb-2.5">Apuestas de la jornada</h2>
          <BettingMarketsBoard
            markets={markets}
            userId={user?.id ?? ''}
            chipsLeft={ctx.chipsLeft}
            roundStatus={round.status}
            round={round}
            jackpotByTemplate={jackpotByTemplate}
          />
        </div>
      )}

      {round.status === 'scheduled' && availableFromCatalog.length > 0 && (
        <AddQuestionPicker roundId={roundId} templates={availableFromCatalog} />
      )}

      <div
        className="rounded-2xl px-3.5 py-3 text-xs"
        style={{ background: 'var(--surface2)', color: 'oklch(0.35 0.08 155)' }}
      >
        ⚖️ Menos fichas en el resultado ganador = mayor premio. No puedes apostar en contra de ti mismo.
        {' '}
        <a href={`/admin/jornadas/${roundId}/mercados`} className="font-bold" style={{ color: 'var(--accent)' }}>
          Gestionar / resolver preguntas →
        </a>
      </div>
    </div>
  )
}
