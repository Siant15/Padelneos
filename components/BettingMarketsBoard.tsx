'use client'

import { useState, useEffect, useRef } from 'react'
import { Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingMarket } from '@/lib/types'
import { isValidSetScore } from '@/lib/types'
import { marketCloseTime, canonicalExactScore, ANSWER_TYPE_ICON } from '@/lib/betting'
import { revalidateLigaData } from '@/lib/actions'
import { friendlyError } from '@/lib/errors'

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

  const hasInteracted = useRef(false)

  function selectOption(marketId: string, optionId: string) {
    hasInteracted.current = true
    setError('')
    setSelections(prev => ({ ...prev, [marketId]: { optionId, chips: prev[marketId]?.chips ?? MIN_BET } }))
  }

  // +10/-10 por opción: si la opción no era la elegida, "+10" la elige
  // empezando en 10 fichas; si ya lo era, suma o resta de 10 en 10
  // (tope en 50, y bajar de 10 la deselecciona del todo).
  function bumpChips(marketId: string, optionId: string, delta: number) {
    hasInteracted.current = true
    setError('')
    setSelections(prev => {
      const current = prev[marketId]
      const base = current?.optionId === optionId ? current.chips : 0
      const next = Math.max(0, Math.min(MAX_BET, base + delta))
      if (next <= 0) {
        const rest = { ...prev }
        delete rest[marketId]
        return rest
      }
      return { ...prev, [marketId]: { optionId, chips: Math.max(MIN_BET, next) } }
    })
  }

  // Escribir el número a mano (los botones +/- son solo un atajo) —
  // no se fuerza el mínimo de 10 mientras se escribe (a medio teclear
  // "1" de camino a "15" no tendría sentido subirlo solo a 10), el
  // mínimo real ya lo exige el guardado.
  function setChipsDirectly(marketId: string, optionId: string, value: number) {
    hasInteracted.current = true
    setError('')
    const clamped = Math.max(0, Math.min(MAX_BET, value))
    if (clamped <= 0) {
      setSelections(prev => {
        const rest = { ...prev }
        delete rest[marketId]
        return rest
      })
      return
    }
    setSelections(prev => ({ ...prev, [marketId]: { optionId, chips: clamped } }))
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

  // Se guarda solo en cuanto el reparto es válido (las 100 fichas
  // repartidas entre todas las preguntas, cada una entre 10 y 50) — no
  // hace falta bajar a un botón de "Guardar" para confirmar cada
  // cambio. Solo se dispara tras una interacción real del jugador (no
  // al montar el componente con una apuesta ya guardada de antes).
  useEffect(() => {
    if (hasInteracted.current && canSubmit && !saving) {
      handleSubmitBets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections])

  // Mientras el reparto está a medias (ya se ha tocado algo pero no
  // suma 100 todavía) nada se ha guardado — avisa del navegador antes
  // de cerrar la pestaña o navegar fuera, para no perder el reparto en
  // silencio.
  useEffect(() => {
    if (!(hasInteracted.current && totalChosen > 0 && totalChosen !== ROUND_TOTAL)) return
    function onBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [totalChosen])

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
      setError(friendlyError(optionError?.message, 'No se pudo registrar ese marcador.'))
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
      setError(friendlyError(deleteError.message, 'No se pudo borrar la pregunta.'))
      return
    }
    await revalidateLigaData()
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3.5">
      {editableMarkets.length > 0 && (
        <div
          className="sticky z-30 -mx-4 px-4 py-2 flex flex-col gap-0.5"
          style={{
            top: 52,
            background: totalChosen === ROUND_TOTAL ? 'var(--surface)' : 'var(--orange-bg)',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: totalChosen === ROUND_TOTAL ? 'var(--green)' : 'var(--orange)', fontWeight: 700 }}>
              {totalChosen} / {ROUND_TOTAL} fichas apostadas
            </span>
            {saving && <span style={{ color: 'var(--text-muted)' }}>Guardando...</span>}
            {!saving && saved && <span style={{ color: 'var(--green)' }}>✓ Guardado</span>}
          </div>
          {totalChosen !== ROUND_TOTAL && (
            <p className="text-[11px]" style={{ color: '#7A5A1E' }}>
              Hay que repartir las 100 fichas entre las {editableMarkets.length} preguntas ({MIN_BET}-{MAX_BET} cada una) — si sales sin completar el reparto, no se guarda nada.
            </p>
          )}
        </div>
      )}

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
                const optionChips = isChosen ? selection.chips : 0
                return (
                  <div key={option.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!canBet}
                      onClick={() => selectOption(market.id, option.id)}
                      className="flex-1 text-left px-3 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-60"
                      style={{
                        background: isChosen ? 'var(--accent)' : 'var(--surface2)',
                        color: isChosen ? '#fff' : 'var(--text)',
                        border: `1px solid ${isChosen ? 'var(--accent)' : 'var(--hairline)'}`,
                      }}
                    >
                      {isWinner && '🏆 '}{option.label}
                    </button>
                    {canBet && (
                      <>
                        <button
                          type="button"
                          onClick={() => bumpChips(market.id, option.id, -10)}
                          disabled={!isChosen}
                          aria-label={`Quitar 10 fichas de ${option.label}`}
                          title="-10 fichas"
                          className="w-11 h-11 rounded-lg text-base font-bold shrink-0 flex items-center justify-center transition hover:opacity-90 disabled:opacity-40"
                          style={{ background: 'var(--red)', color: '#fff' }}
                        >
                          −
                        </button>
                        <ChipInput
                          value={optionChips}
                          onCommit={v => setChipsDirectly(market.id, option.id, v)}
                        />
                        <button
                          type="button"
                          onClick={() => bumpChips(market.id, option.id, 10)}
                          disabled={isChosen && optionChips >= MAX_BET}
                          aria-label={`Añadir 10 fichas a ${option.label}`}
                          title="+10 fichas"
                          className="w-11 h-11 rounded-lg text-base font-bold shrink-0 flex items-center justify-center transition hover:opacity-90 disabled:opacity-40"
                          style={{ background: 'var(--green)', color: '#fff' }}
                        >
                          +
                        </button>
                      </>
                    )}
                    {!canBet && isChosen && (
                      <span className="text-xs font-bold" style={{ color: 'var(--text-muted2)' }}>{optionChips}f</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          </div>
        )
      })}

    </div>
  )
}

// Número de fichas editable a mano (los botones +/- son solo un
// atajo de 10 en 10) — el valor local se sincroniza con el real solo
// al perder el foco, no en cada pulsación, para no disparar guardados
// a medio escribir (p. ej. al pasar por "1" de camino a "15").
function ChipInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  // Ajustado durante el render (no en un efecto) cuando el valor real
  // cambia por fuera (p. ej. al pulsar +/-), para no sumar una pasada
  // de render extra.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setText(String(value))
  }

  return (
    <input
      type="number"
      min={0}
      max={MAX_BET}
      value={text}
      onChange={e => setText(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={() => onCommit(Math.max(0, parseInt(text, 10) || 0))}
      className="w-12 h-11 text-center text-sm font-bold rounded-lg py-1 outline-none shrink-0"
      style={{ border: '1px solid var(--hairline)', color: 'var(--text)' }}
    />
  )
}

function describeBetError(message: string): string {
  return friendlyError(message, 'No se pudo guardar la apuesta. Inténtalo de nuevo.')
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
  const [infoOpen, setInfoOpen] = useState(false)

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
        <div className="font-heading font-bold text-[13px] flex items-center gap-1.5">
          🔢 {market.description} · gratis
          <span className="relative inline-flex items-center">
            <button
              type="button"
              onClick={() => setInfoOpen(v => !v)}
              aria-expanded={infoOpen}
              aria-label="Cómo funciona el marcador exacto"
              className="flex items-center justify-center rounded-full"
              style={{ width: 16, height: 16, color: 'var(--accent)', background: 'var(--tint)' }}
            >
              <Info size={11} strokeWidth={2.4} />
            </button>
            {infoOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setInfoOpen(false)} aria-hidden="true" />
                <div
                  role="tooltip"
                  className="fixed left-1/2 z-50 w-[calc(100vw-2.5rem)] max-w-sm rounded-xl p-3 text-left"
                  style={{ top: '5rem', transform: 'translateX(-50%)', background: 'var(--surface)', boxShadow: '0 6px 20px rgba(0,0,0,0.14)', border: '1px solid var(--border)' }}
                >
                  <p className="text-[11px] font-bold mb-2" style={{ color: 'var(--text-muted2)' }}>Marcador exacto</p>
                  <p className="text-[11px]" style={{ color: 'var(--text)' }}>
                    Sin coste — se resuelve la primera de todas. Si aciertas el marcador exacto, te llevas TODAS las fichas de la jornada (las de todos, no solo las tuyas) y 1,5 puntos de clasificación — repartido a partes iguales si hay empate entre varios acertantes.
                  </p>
                </div>
              </>
            )}
          </span>
        </div>
        {market.resolved && !market.voided && <span className="text-xs font-bold" style={{ color: 'var(--green)' }}>✓</span>}
      </div>
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
