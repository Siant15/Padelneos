'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingMarket } from '@/lib/types'
import { isValidSetScore } from '@/lib/types'
import { marketCloseTime, canonicalExactScore, ANSWER_TYPE_ICON } from '@/lib/betting'
import { revalidateLigaData } from '@/lib/actions'

interface Props {
  roundId: string
  markets: BettingMarket[]
  userId: string
  roundStatus: string
  round: { scheduled_date: string | null; scheduled_time: string | null }
  jackpotByTemplate: Record<string, number>
}

const MIN_BET = 10
const MAX_BET = 50
const ROUND_TOTAL = 100

export default function BettingMarketsBoard({ roundId, markets, userId, roundStatus, round, jackpotByTemplate }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const exactScoreMarket = markets.find(m => m.type === 'exact_score') ?? null
  // Orden fijo para las preguntas "estructurales" del partido —
  // ganador y resultado por sets primero, en ese orden — y el resto
  // (preguntas elegidas del catálogo) después, en el orden que ya
  // tuvieran.
  const STRUCTURAL_ORDER = ['Ganador del partido', 'Resultado por sets']
  const paidMarkets = markets
    .filter(m => m.type !== 'exact_score')
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ra = STRUCTURAL_ORDER.indexOf(a.m.description)
      const rb = STRUCTURAL_ORDER.indexOf(b.m.description)
      if (ra === -1 && rb === -1) return a.i - b.i
      if (ra === -1) return 1
      if (rb === -1) return -1
      return ra - rb
    })
    .map(({ m }) => m)
  const lastStructuralIndex = paidMarkets.reduce((acc, m, i) => STRUCTURAL_ORDER.includes(m.description) ? i : acc, -1)

  // Cada pregunta de pago es una única elección (opción + fichas), no
  // un reparto libre entre varias opciones de la misma pregunta — se
  // precarga con la apuesta ya guardada de este jugador, si la había.
  const initialSelections: Record<string, { optionId: string; chips: number }> = {}
  for (const market of paidMarkets) {
    const myBet = market.bets?.find(b => b.player_id === userId)
    if (myBet) initialSelections[market.id] = { optionId: myBet.option_id, chips: myBet.chips }
  }

  const [selections, setSelections] = useState(initialSelections)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [exactScoreDraft, setExactScoreDraft] = useState<[string, string][]>(() => {
    const myOption = exactScoreMarket?.options?.find(o => (exactScoreMarket.bets ?? []).some(b => b.player_id === userId && b.option_id === o.id))
    if (!myOption?.value) return [['', ''], ['', '']]
    const sets = myOption.value.split(',').map(s => s.split('-') as [string, string])
    return sets.length ? sets : [['', ''], ['', '']]
  })
  const [exactScoreSaving, setExactScoreSaving] = useState(false)
  const [deletingMarket, setDeletingMarket] = useState<string | null>(null)

  function getTotalChipsOnOption(market: BettingMarket, optionId: string) {
    return market.bets?.filter(b => b.option_id === optionId).reduce((s, b) => s + b.chips, 0) ?? 0
  }

  const editableMarkets = paidMarkets.filter(m => {
    const closeTime = marketCloseTime(m, round)
    const isClosedByTime = closeTime !== null && new Date(closeTime) <= new Date()
    return roundStatus === 'scheduled' && !m.resolved && !isClosedByTime
  })

  const totalChosen = editableMarkets.reduce((s, m) => s + (selections[m.id]?.chips ?? 0), 0)
  const allChosen = editableMarkets.every(m => !!selections[m.id]?.optionId)
  const allInRange = editableMarkets.every(m => {
    const c = selections[m.id]?.chips ?? 0
    return c >= MIN_BET && c <= MAX_BET
  })
  const canSubmit = editableMarkets.length > 0 && allChosen && allInRange && totalChosen === ROUND_TOTAL

  function selectOption(marketId: string, optionId: string) {
    setSelections(prev => ({ ...prev, [marketId]: { optionId, chips: prev[marketId]?.chips ?? MIN_BET } }))
  }

  function setChipsFor(marketId: string, chips: number) {
    setSelections(prev => ({ ...prev, [marketId]: { optionId: prev[marketId]?.optionId ?? '', chips } }))
  }

  async function handleSubmitBets() {
    if (!canSubmit) return
    setSaving(true)
    setError('')

    const bets = editableMarkets.map(m => ({
      market_id: m.id,
      option_id: selections[m.id].optionId,
      chips: selections[m.id].chips,
    }))

    const { error: rpcError } = await supabase.rpc('place_round_bets', { p_round_id: roundId, p_bets: bets })
    setSaving(false)
    if (rpcError) {
      setError(describeBetError(rpcError.message))
      return
    }
    setSaved(true)
    await revalidateLigaData()
    router.refresh()
    setTimeout(() => setSaved(false), 2500)
  }

  // Marcador exacto: gratis, no cuenta fichas — busca-o-crea la opción
  // para ese marcador concreto (así dos jugadores que pronostican lo
  // mismo comparten opción) y guarda la predicción.
  async function betExactScore() {
    if (!exactScoreMarket) return
    const parsed = exactScoreDraft.map(([a, b]) => ({ t1: parseInt(a, 10), t2: parseInt(b, 10) }))
    if (parsed.some(s => Number.isNaN(s.t1) || Number.isNaN(s.t2) || !isValidSetScore(s.t1, s.t2))) {
      setError('El marcador introducido no es válido.')
      return
    }

    setExactScoreSaving(true)
    setError('')

    const value = canonicalExactScore(parsed)
    const label = parsed.map(s => `${s.t1}-${s.t2}`).join(', ')
    const { data: optionId, error: optionError } = await supabase.rpc('instantiate_exact_score_option', {
      p_market_id: exactScoreMarket.id,
      p_value: value,
      p_label: label,
    })

    if (optionError || !optionId) {
      setError('No se pudo registrar ese marcador: ' + (optionError?.message ?? 'error desconocido'))
      setExactScoreSaving(false)
      return
    }

    const { error: betError } = await supabase.from('bets').upsert(
      { market_id: exactScoreMarket.id, option_id: optionId, player_id: userId, chips: 0 },
      { onConflict: 'market_id,option_id,player_id' }
    )

    setExactScoreSaving(false)
    if (betError) {
      setError(describeBetError(betError.message))
      return
    }
    await revalidateLigaData()
    router.refresh()
  }

  async function deleteMarket(marketId: string) {
    if (!confirm('¿Borrar esta pregunta? Todavía no tiene fichas apostadas.')) return
    setDeletingMarket(marketId)
    setError('')
    const { error: deleteError } = await supabase.from('betting_markets').delete().eq('id', marketId)
    setDeletingMarket(null)
    if (deleteError) {
      setError('No se pudo borrar la pregunta: ' + deleteError.message)
      return
    }
    await revalidateLigaData()
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3.5">
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

      {exactScoreMarket && (
        <ExactScoreCard
          market={exactScoreMarket}
          canBet={roundStatus === 'scheduled' && !exactScoreMarket.resolved && (() => {
            // A diferencia del resto de preguntas, el marcador exacto se
            // puede pronosticar aunque la jornada todavía no tenga día y
            // hora confirmados (closeTime === null) — no hay forma de
            // hacer trampa apostando "tarde" sobre un partido que ni
            // siquiera está programado. En cuanto sí hay fecha, cierra
            // igual que las demás (1h antes).
            const closeTime = marketCloseTime(exactScoreMarket, round)
            return closeTime === null || new Date(closeTime) > new Date()
          })()}
          userId={userId}
          draft={exactScoreDraft}
          onDraftChange={setExactScoreDraft}
          onSubmit={betExactScore}
          saving={exactScoreSaving}
        />
      )}

      {paidMarkets.map((market, idx) => {
        const closeTime = marketCloseTime(market, round)
        const isClosedByTime = closeTime !== null && new Date(closeTime) <= new Date()
        const canBet = roundStatus === 'scheduled' && !market.resolved && !isClosedByTime
        const totalMarketChips = (market.options ?? []).reduce((s, o) => s + getTotalChipsOnOption(market, o.id), 0)
        const jackpot = (market.template_id && jackpotByTemplate[market.template_id]) || 0
        const potWithJackpot = totalMarketChips + jackpot
        const selection = selections[market.id]
        const showDividerBefore = lastStructuralIndex !== -1 && idx === lastStructuralIndex + 1

        return (
          <div key={market.id}>
          {showDividerBefore && (
            <div className="flex items-center gap-2 my-1" aria-hidden>
              <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
              <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted2)' }}>PREGUNTAS DE LA JORNADA</span>
              <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
            </div>
          )}
          <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between">
              <div className="font-heading font-bold text-[13px]">
                {ANSWER_TYPE_ICON[market.type] ?? '🎾'} {market.description}
              </div>
              {market.resolved && !market.voided && <span className="text-xs font-bold" style={{ color: 'var(--green)' }}>✓</span>}
              {market.resolved && market.voided && <span className="text-xs font-bold" style={{ color: 'var(--text-muted2)' }}>Anulada</span>}
              {!market.resolved && isClosedByTime && (
                <span className="text-xs font-bold" style={{ color: 'var(--red)' }}>🔒 Cerrado</span>
              )}
              {!market.resolved && totalMarketChips === 0 && (
                <button
                  type="button"
                  onClick={() => deleteMarket(market.id)}
                  disabled={deletingMarket === market.id}
                  aria-label="Borrar pregunta"
                  title="Borrar esta pregunta"
                  className="text-xs px-1.5 shrink-0 disabled:opacity-40"
                  style={{ color: 'var(--red)' }}
                >
                  {deletingMarket === market.id ? '···' : '🗑️'}
                </button>
              )}
            </div>
            {!market.resolved && !isClosedByTime && closeTime && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted2)' }}>
                Cierra el {new Date(closeTime).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            {!market.resolved && !isClosedByTime && !closeTime && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--orange)' }}>
                Se abrirá cuando esta jornada tenga día y hora confirmados
              </p>
            )}
            {jackpot > 0 && (
              <p className="text-[11px] mt-1 font-bold" style={{ color: 'var(--accent)' }}>
                🎰 Jackpot acumulado: {jackpot} fichas (nadie acertó la última vez)
              </p>
            )}
            {totalMarketChips > 0 && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted2)' }}>
                Bote: {totalMarketChips}{jackpot > 0 ? ` + ${jackpot} de jackpot = ${potWithJackpot}` : ''} fichas
              </p>
            )}

            <div className="flex flex-col gap-1.5 mt-2.5">
              {market.options?.filter(option => !(option.player_id === userId && option.is_self_negative)).map(option => {
                const isWinner = market.winning_option_id === option.id
                const isChosen = selection?.optionId === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!canBet}
                    onClick={() => selectOption(market.id, option.id)}
                    className="text-left px-3 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-60"
                    style={{
                      background: isChosen ? 'var(--accent)' : 'var(--surface2)',
                      color: isChosen ? '#fff' : 'var(--text)',
                      border: `1px solid ${isChosen ? 'var(--accent)' : 'var(--hairline)'}`,
                    }}
                  >
                    {isWinner && '🏆 '}{option.label}
                  </button>
                )
              })}
            </div>

            {canBet && selection?.optionId && (
              <div className="flex items-center gap-2 mt-2.5">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Fichas ({MIN_BET}-{MAX_BET}):</span>
                <input
                  type="number"
                  min={MIN_BET}
                  max={MAX_BET}
                  value={selection.chips}
                  onChange={e => setChipsFor(market.id, Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-16 text-center text-xs rounded-lg py-1 outline-none"
                  style={{ border: '1px solid var(--hairline)', color: 'var(--text)' }}
                />
              </div>
            )}
          </div>
          </div>
        )
      })}

      {editableMarkets.length > 0 && (
        <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <p className="text-xs" style={{ color: totalChosen === ROUND_TOTAL ? 'var(--green)' : 'var(--text-muted2)' }}>
            Llevas repartidas <strong>{totalChosen}</strong> de {ROUND_TOTAL} fichas — hay que apostar en las {editableMarkets.length} preguntas de esta jornada, entre {MIN_BET} y {MAX_BET} fichas cada una, sumando exactamente {ROUND_TOTAL}.
          </p>
          <button
            type="button"
            onClick={handleSubmitBets}
            disabled={!canSubmit || saving}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-90 disabled:opacity-40"
            style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}
          >
            {saving ? 'Guardando...' : saved ? '✓ Apuestas guardadas' : 'Guardar mis apuestas de la jornada'}
          </button>
        </div>
      )}
    </div>
  )
}

function describeBetError(message: string): string {
  if (message.includes('Límite')) return message
  if (message.includes('apostar por ti mismo')) return message
  if (message.includes('cerrado') || message.includes('resuelto') || message.includes('confirmados')) return message
  if (message.includes('fichas') || message.includes('preguntas')) return message
  return 'No se pudo guardar la apuesta: ' + message
}

// ─── Marcador exacto: gratis, 2-3 sets con inputs numéricos, igual
// que en el registro de resultado, en vez de una lista de opciones.
function ExactScoreCard({ market, canBet, draft, onDraftChange, onSubmit, saving }: {
  market: BettingMarket
  canBet: boolean
  userId: string
  draft: [string, string][]
  onDraftChange: (d: [string, string][]) => void
  onSubmit: () => void
  saving: boolean
}) {
  const myBetOptions = (market.options ?? []).filter(o => (market.bets ?? []).some(b => b.option_id === o.id))
  const closeTime = market.closes_at

  function setSet(i: number, side: 0 | 1, value: string) {
    const next = draft.map(s => [...s]) as [string, string][]
    next[i][side] = value
    onDraftChange(next)
  }

  function toggleThirdSet() {
    onDraftChange(draft.length === 3 ? draft.slice(0, 2) as [string, string][] : [...draft, ['', '']] as [string, string][])
  }

  return (
    <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center justify-between">
        <div className="font-heading font-bold text-[13px]">🔢 {market.description} · gratis</div>
        {market.resolved && !market.voided && <span className="text-xs font-bold" style={{ color: 'var(--green)' }}>✓</span>}
      </div>
      <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted2)' }}>
        Sin coste — se resuelve la primera de todas. Si aciertas el marcador exacto, te llevas TODAS las fichas de la jornada y 1,5 puntos (repartido si hay empate).
      </p>
      {closeTime && (
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted2)' }}>
          Cierra el {new Date(closeTime).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {myBetOptions.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {myBetOptions.map(o => (
            <p key={o.id} className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Tu pronóstico: <strong>{o.label}</strong>{market.winning_option_id === o.id && ' 🏆'}
            </p>
          ))}
        </div>
      )}

      {canBet && (
        <div className="flex items-center gap-2 mt-2.5">
          {draft.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <input type="number" min={0} max={7} value={s[0]} onChange={e => setSet(i, 0, e.target.value)}
                className="w-9 text-center text-xs rounded-lg py-1.5 outline-none" style={{ border: '1px solid var(--hairline)' }} />
              <span className="text-xs">-</span>
              <input type="number" min={0} max={7} value={s[1]} onChange={e => setSet(i, 1, e.target.value)}
                className="w-9 text-center text-xs rounded-lg py-1.5 outline-none" style={{ border: '1px solid var(--hairline)' }} />
            </div>
          ))}
          <button type="button" onClick={toggleThirdSet} className="text-[11px] px-2 rounded-lg" style={{ border: '1px solid var(--hairline)', color: 'var(--text-muted)' }}>
            {draft.length === 3 ? '−3.º set' : '+3.º set'}
          </button>
          <button type="button" onClick={onSubmit} disabled={saving}
            className="ml-auto text-xs font-bold px-3 py-1.5 rounded-lg transition hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {saving ? '...' : myBetOptions.length ? 'Cambiar' : 'Pronosticar'}
          </button>
        </div>
      )}
    </div>
  )
}
