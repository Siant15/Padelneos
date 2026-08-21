import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BettingMarketsBoard from '@/components/BettingMarketsBoard'
import AddQuestionPicker from '@/components/AddQuestionPicker'
import type { Profile } from '@/lib/types'
import { getRoundBettingContext } from '@/lib/betting-queries'
import { CHIPS_PER_ROUND } from '@/lib/betting'

export default async function ApuestasPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const ctx = await getRoundBettingContext(supabase, roundId, user?.id ?? '')
  if (!ctx.round) notFound()
  const round = ctx.round
  const markets = ctx.markets

  const templateIds = [...new Set(markets.map(m => m.template_id).filter((id): id is string => !!id))]
  const [{ data: jackpots }, { data: catalog }, { data: bettingResults }] = await Promise.all([
    templateIds.length
      ? supabase.from('jackpots').select('template_id, chips').eq('season_id', round.season_id ?? '').in('template_id', templateIds)
      : Promise.resolve({ data: [] as { template_id: string; chips: number }[] }),
    supabase.from('betting_question_templates').select('*').eq('active', true).order('text'),
    supabase.from('betting_round_results').select('*, player:profiles(id, name)').eq('round_id', roundId).order('rank'),
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

      {/* Resultados finales si ya están liquidados */}
      {ctx.isSettled && bettingResults && bettingResults.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <p className="text-xs font-extrabold mb-3" style={{ color: 'var(--text-muted2)' }}>RESULTADO APUESTAS</p>
          <div className="space-y-2">
            {bettingResults.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-muted)' }}>{r.rank}.</span>
                  <span className="font-bold">{(r.player as Profile)?.name}</span>
                  {r.player_id === user?.id && <span className="text-xs" style={{ color: 'var(--accent)' }}>(tú)</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-muted2)' }}>{r.chips_final} fichas</span>
                  {r.point_bonus > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>
                      +{r.point_bonus} pt
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted2)' }}>
            100 iniciales − apostadas + recibidas = fichas finales.
          </p>
        </div>
      )}

      {/* Mercados */}
      {!markets.length ? (
        <div
          className="rounded-2xl p-6 text-center text-sm"
          style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
        >
          Aún no hay apuestas para esta jornada.
        </div>
      ) : (
        <BettingMarketsBoard
          markets={markets}
          userId={user?.id ?? ''}
          chipsLeft={ctx.chipsLeft}
          roundStatus={round.status}
          round={round}
          jackpotByTemplate={jackpotByTemplate}
        />
      )}

      {round.status === 'scheduled' && !ctx.isSettled && availableFromCatalog.length > 0 && (
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
