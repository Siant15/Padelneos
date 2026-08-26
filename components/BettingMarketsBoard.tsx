'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingMarket } from '@/lib/types'
import { isValidSetScore } from '@/lib/types'
import { marketCloseTime, canonicalExactScore, ANSWER_TYPE_ICON, QUICK_BET_AMOUNT, CHIPS_PER_ROUND } from '@/lib/betting'
import { revalidateLigaData } from '@/lib/actions'

interface Props {
  markets: BettingMarket[]
  userId: string
  chipsLeft: number
  roundStatus: string
  round: { scheduled_date: string | null; scheduled_time: string | null }
  jackpotByTemplate: Record<string, number>
}

const OPTION_COLORS = ['oklch(0.42 0.1 155)', 'oklch(0.72 0.16 55)', '#2BB673', '#FFC93D', 'oklch(0.6 0.02 260)']

export default function BettingMarketsBoard({ markets, userId, chipsLeft, roundStatus, round, jackpotByTemplate }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const originalChips: Record<string, number> = {}
  const optionMarketId: Record<string, string> = {}
  for (const market of markets) {
    for (const bet of market.bets?.filter(b => b.player_id === userId) ?? []) {
      originalChips[bet.option_id] = bet.chips
    }
    for (const option of market.options ?? []) {
      optionMarketId[option.id] = market.id
    }
  }

  const [chips, setChips] = useState<Record<string, number>>(originalChips)
  const [savingOption, setSavingOption] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [quickBetting, setQuickBetting] = useState<string | null>(null)
  const [exactScoreDrafts, setExactScoreDrafts] = useState<Record<string, [string, string][]>>({})
  const [exactScoreChips, setExactScoreChips] = useState<Record<string, number>>({})
  const [exactScoreSaving, setExactScoreSaving] = useState<string | null>(null)

  const originalTotal = Object.values(originalChips).reduce((s, v) => s + v, 0)
  const chipsAvailable = chipsLeft + originalTotal
  const totalChips = Object.values(chips).reduce((s, v) => s + v, 0)
  const chipsRemaining = chipsAvailable - totalChips

  const editableMarkets = markets.filter(m => {
    const closeTime = marketCloseTime(m, round)
    const isClosedByTime = closeTime !== null && new Date(closeTime) <= new Date()
    return roundStatus === 'scheduled' && !m.resolved && !isClosedByTime
  })

  function getTotalChipsOnOption(market: BettingMarket, optionId: string) {
    return market.bets?.filter(b => b.option_id === optionId).reduce((s, b) => s + b.chips, 0) ?? 0
  }

  // Autoguardado: cada cambio en una casilla de fichas se guarda solo
  // (al perder el foco), sin botón de "Guardar apuestas" aparte —
  // mismo criterio que la apuesta rápida (quickBet).
  async function commitChip(marketId: string, optionId: string) {
    const value = chips[optionId] ?? 0
    const original = originalChips[optionId] ?? 0
    if (value === original) return

    const projectedTotal = totalChips - original + value
    if (projectedTotal > chipsAvailable) {
      setError(`No te quedan fichas suficientes (disponibles: ${chipsAvailable - (totalChips - value)}).`)
      setChips(c => ({ ...c, [optionId]: original }))
      return
    }

    setSavingOption(optionId)
    setError('')

    const { error: saveError } = value > 0
      ? await supabase.from('bets').upsert({ market_id: marketId, option_id: optionId, player_id: userId, chips: value }, { onConflict: 'market_id,option_id,player_id' })
      : await supabase.from('bets').delete().eq('player_id', userId).eq('option_id', optionId)

    setSavingOption(null)
    if (saveError) {
      setError(describeBetError(saveError.message))
      setChips(c => ({ ...c, [optionId]: original }))
      return
    }
    await revalidateLigaData()
    router.refresh()
  }

  // Apuesta rápida: suma o resta QUICK_BET_AMOUNT fichas a esta opción y
  // guarda al momento, sin pasar por el botón general de "Guardar apuestas".
  async function quickBet(marketId: string, optionId: string, delta: number) {
    const current = chips[optionId] ?? 0
    const newValue = Math.max(0, current + delta)
    if (newValue === current) return
    if (totalChips - current + newValue > chipsAvailable) {
      setError(`No te quedan fichas suficientes para apostar ${QUICK_BET_AMOUNT} más.`)
      return
    }
    setQuickBetting(optionId)
    setError('')

    const { error: saveError } = newValue > 0
      ? await supabase.from('bets').upsert({ market_id: marketId, option_id: optionId, player_id: userId, chips: newValue }, { onConflict: 'market_id,option_id,player_id' })
      : await supabase.from('bets').delete().eq('player_id', userId).eq('option_id', optionId)

    setQuickBetting(null)
    if (saveError) {
      setError(describeBetError(saveError.message))
      return
    }
    setChips(c => ({ ...c, [optionId]: newValue }))
    await revalidateLigaData()
    router.refresh()
  }

  // Marcador exacto: busca-o-crea la opción para ese marcador concreto
  // (así dos jugadores que pronostican lo mismo comparten bote) y
  // apuesta sobre ella.
  async function betExactScore(market: BettingMarket) {
    const draft = exactScoreDrafts[market.id] ?? [['', ''], ['', '']]
    const parsed = draft.map(([a, b]) => ({ t1: parseInt(a, 10), t2: parseInt(b, 10) }))
    const betChips = exactScoreChips[market.id] ?? 0

    if (parsed.some(s => Number.isNaN(s.t1) || Number.isNaN(s.t2) || !isValidSetScore(s.t1, s.t2))) {
      setError('El marcador introducido no es válido.')
      return
    }
    if (betChips <= 0) {
      setError('Introduce cuántas fichas quieres apostar a ese marcador.')
      return
    }
    if (totalChips + betChips > chipsAvailable) {
      setError('No te quedan fichas suficientes para esa apuesta.')
      return
    }

    setExactScoreSaving(market.id)
    setError('')

    const value = canonicalExactScore(parsed)
    const label = parsed.map(s => `${s.t1}-${s.t2}`).join(', ')
    const { data: optionId, error: optionError } = await supabase.rpc('instantiate_exact_score_option', {
      p_market_id: market.id,
      p_value: value,
      p_label: label,
    })

    if (optionError || !optionId) {
      setError('No se pudo registrar ese marcador: ' + (optionError?.message ?? 'error desconocido'))
      setExactScoreSaving(null)
      return
    }

    const { error: betError } = await supabase.from('bets').upsert(
      { market_id: market.id, option_id: optionId, player_id: userId, chips: betChips },
      { onConflict: 'market_id,option_id,player_id' }
    )

    setExactScoreSaving(null)
    if (betError) {
      setError(describeBetError(betError.message))
      return
    }
    await revalidateLigaData()
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3.5">
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
      {editableMarkets.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted2)' }}>
          Te quedan <strong>{chipsRemaining}</strong> de {chipsAvailable} fichas por apostar en esta jornada
        </p>
      )}

      {markets.map(market => {
        const closeTime = marketCloseTime(market, round)
        const isClosedByTime = closeTime !== null && new Date(closeTime) <= new Date()
        const canBet = roundStatus === 'scheduled' && !market.resolved && !isClosedByTime
        const totalMarketChips = (market.options ?? []).reduce((s, o) => s + getTotalChipsOnOption(market, o.id), 0)
        const jackpot = (market.template_id && jackpotByTemplate[market.template_id]) || 0
        const potWithJackpot = totalMarketChips + jackpot
        const isExactScore = market.type === 'exact_score'

        return (
          <div key={market.id} className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between">
              <div className="font-heading font-bold text-[13px]">
                {ANSWER_TYPE_ICON[market.type] ?? '🎾'} {market.description}
              </div>
              {market.resolved && !market.voided && <span className="text-xs font-bold" style={{ color: 'var(--green)' }}>✓</span>}
              {market.resolved && market.voided && <span className="text-xs font-bold" style={{ color: 'var(--text-muted2)' }}>Anulada</span>}
              {!market.resolved && isClosedByTime && (
                <span className="text-xs font-bold" style={{ color: 'var(--red)' }}>🔒 Cerrado</span>
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

            {isExactScore ? (
              <ExactScoreBetForm
                market={market}
                canBet={canBet}
                userId={userId}
                draft={exactScoreDrafts[market.id] ?? [['', ''], ['', '']]}
                onDraftChange={d => setExactScoreDrafts(prev => ({ ...prev, [market.id]: d }))}
                betChips={exactScoreChips[market.id] ?? 0}
                onBetChipsChange={v => setExactScoreChips(prev => ({ ...prev, [market.id]: v }))}
                onSubmit={() => betExactScore(market)}
                saving={exactScoreSaving === market.id}
              />
            ) : (
              <div className="flex flex-col gap-2 mt-2.5">
                {market.options?.map((option, idx) => {
                  const isWinner = market.winning_option_id === option.id
                  const myChips = chips[option.id] ?? 0
                  // La barra solo representa TUS fichas en esta opción (sobre
                  // el total de 100 de la jornada), nunca lo que hayan
                  // apostado los demás — a propósito de que no se puede
                  // saber ni inferir cuánto o quién apostó cada cosa.
                  const pct = Math.min(100, Math.round((myChips / CHIPS_PER_ROUND) * 100))
                  const isSelfNegativeBet = option.player_id === userId && option.is_self_negative
                  const color = isSelfNegativeBet ? 'var(--text-muted2)' : OPTION_COLORS[idx % OPTION_COLORS.length]

                  return (
                    <div key={option.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold">
                          {isWinner && '🏆 '}{option.label}
                          {isSelfNegativeBet && <span className="ml-1" style={{ color: 'var(--red)' }}>🚫</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--tint)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, opacity: isSelfNegativeBet ? 0.5 : 1 }} />
                        </div>
                        {canBet && !isSelfNegativeBet ? (
                          <>
                            <button
                              type="button"
                              onClick={() => quickBet(market.id, option.id, QUICK_BET_AMOUNT)}
                              disabled={quickBetting === option.id}
                              title={`Apostar ${QUICK_BET_AMOUNT} fichas más aquí`}
                              className="w-8 h-8 rounded-lg text-sm font-bold shrink-0 flex items-center justify-center transition hover:opacity-90 disabled:opacity-40"
                              style={{ background: 'var(--green)', color: '#fff' }}
                            >
                              {quickBetting === option.id ? '···' : '+'}
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={chipsAvailable}
                              value={myChips}
                              onChange={e => setChips(c => ({ ...c, [option.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                              onFocus={e => e.target.select()}
                              onBlur={() => commitChip(market.id, option.id)}
                              disabled={savingOption === option.id}
                              className="w-[52px] text-center text-xs rounded-lg py-1 outline-none disabled:opacity-50"
                              style={{ border: '1px solid var(--hairline)', color: 'var(--text)' }}
                            />
                            <button
                              type="button"
                              onClick={() => quickBet(market.id, option.id, -QUICK_BET_AMOUNT)}
                              disabled={quickBetting === option.id || myChips <= 0}
                              title={`Quitar ${QUICK_BET_AMOUNT} fichas de aquí`}
                              className="w-8 h-8 rounded-lg text-sm font-bold shrink-0 flex items-center justify-center transition hover:opacity-90 disabled:opacity-40"
                              style={{ background: 'var(--red)', color: '#fff' }}
                            >
                              {quickBetting === option.id ? '···' : '−'}
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] w-[38px] text-right" style={{ color: 'var(--text-muted2)' }}>{myChips}f</span>
                        )}
                      </div>
                      {isSelfNegativeBet && (
                        <p className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>No puedes apostar contra ti mismo</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

    </div>
  )
}

function describeBetError(message: string): string {
  if (message.includes('Límite')) return message
  if (message.includes('apostar por ti mismo')) return message
  if (message.includes('cerrado') || message.includes('resuelto') || message.includes('confirmados')) return message
  return 'No se pudo guardar la apuesta: ' + message
}

// ─── Marcador exacto: 2-3 sets con inputs numéricos, igual que en el
// registro de resultado, en vez de una lista de opciones fijas.
function ExactScoreBetForm({ market, canBet, draft, onDraftChange, betChips, onBetChipsChange, onSubmit, saving }: {
  market: BettingMarket
  canBet: boolean
  userId: string
  draft: [string, string][]
  onDraftChange: (d: [string, string][]) => void
  betChips: number
  onBetChipsChange: (v: number) => void
  onSubmit: () => void
  saving: boolean
}) {
  const myBetOptions = (market.options ?? []).filter(o => (market.bets ?? []).some(b => b.option_id === o.id))

  function setSet(i: number, side: 0 | 1, value: string) {
    const next = draft.map(s => [...s]) as [string, string][]
    next[i][side] = value
    onDraftChange(next)
  }

  function toggleThirdSet() {
    onDraftChange(draft.length === 3 ? draft.slice(0, 2) as [string, string][] : [...draft, ['', '']] as [string, string][])
  }

  return (
    <div className="mt-2.5">
      {myBetOptions.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {myBetOptions.map(o => {
            const myChips = (market.bets ?? []).filter(b => b.option_id === o.id).reduce((s, b) => s + b.chips, 0)
            return (
              <p key={o.id} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Ya apostaste {myChips}f a <strong>{o.label}</strong>{market.winning_option_id === o.id && ' 🏆'}
              </p>
            )
          })}
        </div>
      )}
      {canBet && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
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
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min={0} placeholder="fichas" value={betChips || ''} onChange={e => onBetChipsChange(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20 text-center text-xs rounded-lg py-1.5 outline-none" style={{ border: '1px solid var(--hairline)' }} />
            <button type="button" onClick={onSubmit} disabled={saving}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {saving ? 'Apostando...' : 'Apostar a este marcador'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
