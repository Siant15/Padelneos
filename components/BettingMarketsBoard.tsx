'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingMarket } from '@/lib/types'

interface Props {
  markets: BettingMarket[]
  userId: string
  chipsLeft: number
  roundStatus: string
  matchDateTime: string
}

const OPTION_COLORS = ['#2E6FF2', '#FF8A3D', '#2BB673', '#FFC93D', '#9AA5B8']
const TYPE_ICON: Record<string, string> = { yes_no: '🎾', player_choice: '🎯', quantity: '🔢' }

// Si un mercado no tiene un cierre manual (closes_at), las apuestas se
// pueden hacer hasta la hora del partido.
function marketCloseTime(market: BettingMarket, matchDateTime: string): string {
  return market.closes_at ?? matchDateTime
}

export default function BettingMarketsBoard({ markets, userId, chipsLeft, roundStatus, matchDateTime }: Props) {
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

  const [editingAll, setEditingAll] = useState(false)
  const [chips, setChips] = useState<Record<string, number>>(originalChips)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const originalTotal = Object.values(originalChips).reduce((s, v) => s + v, 0)
  const chipsAvailable = chipsLeft + originalTotal
  const totalChips = Object.values(chips).reduce((s, v) => s + v, 0)
  const isOverBudget = totalChips > chipsAvailable

  const editableMarkets = markets.filter(m => {
    const isClosedByTime = new Date(marketCloseTime(m, matchDateTime)) <= new Date()
    return roundStatus === 'scheduled' && !m.resolved && !isClosedByTime
  })

  function getTotalChipsOnOption(market: BettingMarket, optionId: string) {
    return market.bets?.filter(b => b.option_id === optionId).reduce((s, b) => s + b.chips, 0) ?? 0
  }

  async function saveAll() {
    if (isOverBudget) return
    setSaving(true)
    setError('')

    const editableOptionIds = new Set(editableMarkets.flatMap(m => (m.options ?? []).map(o => o.id)))
    const toUpsert = Object.entries(chips)
      .filter(([optionId, value]) => value > 0 && editableOptionIds.has(optionId))
      .map(([optionId, value]) => ({ market_id: optionMarketId[optionId], option_id: optionId, player_id: userId, chips: value }))
    const toDelete = Object.keys(originalChips)
      .filter(optionId => editableOptionIds.has(optionId) && !(chips[optionId] > 0))

    if (toUpsert.length) {
      const { error: upsertError } = await supabase.from('bets').upsert(toUpsert, { onConflict: 'market_id,option_id,player_id' })
      if (upsertError) {
        setError(upsertError.message.includes('Límite') ? upsertError.message : 'No se pudo guardar alguna apuesta: ' + upsertError.message)
        setSaving(false)
        return
      }
    }

    if (toDelete.length) {
      const { error: deleteError } = await supabase.from('bets').delete().eq('player_id', userId).in('option_id', toDelete)
      if (deleteError) {
        setError('No se pudieron actualizar todas las apuestas: ' + deleteError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setEditingAll(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3.5">
      {editableMarkets.length > 0 && (
        <button
          onClick={() => editingAll ? saveAll() : setEditingAll(true)}
          disabled={saving || (editingAll && isOverBudget)}
          className="font-heading text-sm px-4 py-2.5 rounded-2xl font-bold self-end transition hover:opacity-90 disabled:opacity-40"
          style={{ background: editingAll ? 'var(--accent)' : 'var(--tint)', color: editingAll ? '#fff' : '#555' }}
        >
          {saving ? 'Guardando...' : editingAll ? '✓ Guardar todas las apuestas' : '✏️ Editar todas las apuestas'}
        </button>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
      {editingAll && (
        <p className="text-xs -mt-2" style={{ color: isOverBudget ? 'var(--red)' : 'var(--text-muted2)' }}>
          {isOverBudget ? `⚠ Te pasas por ${totalChips - chipsAvailable} fichas` : `${totalChips}/${chipsAvailable} fichas usadas en esta jornada`}
        </p>
      )}

      {markets.map(market => {
        const closeTime = marketCloseTime(market, matchDateTime)
        const isClosedByTime = new Date(closeTime) <= new Date()
        const canBet = editingAll && roundStatus === 'scheduled' && !market.resolved && !isClosedByTime
        const totalMarketChips = (market.options ?? []).reduce((s, o) => s + getTotalChipsOnOption(market, o.id), 0)

        return (
          <div key={market.id} className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between">
              <div className="font-heading font-bold text-[13px]">
                {TYPE_ICON[market.type] ?? '🎾'} {market.description}
              </div>
              {market.resolved && <span className="text-xs font-bold" style={{ color: 'var(--green)' }}>✓</span>}
              {!market.resolved && isClosedByTime && (
                <span className="text-xs font-bold" style={{ color: 'var(--red)' }}>🔒 Cerrado</span>
              )}
            </div>
            {!market.resolved && !isClosedByTime && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted2)' }}>
                Cierra el {new Date(closeTime).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}

            <div className="flex flex-col gap-2 mt-2.5">
              {market.options?.map((option, idx) => {
                const totalOnOption = getTotalChipsOnOption(market, option.id)
                const isWinner = market.winning_option_id === option.id
                const myChips = chips[option.id] ?? 0
                const pct = totalMarketChips ? Math.round((totalOnOption / totalMarketChips) * 100) : 0
                const cuota = totalOnOption ? (totalMarketChips / totalOnOption).toFixed(1) : '—'
                const color = OPTION_COLORS[idx % OPTION_COLORS.length]
                const isSelfNegativeBet = option.player_id === userId && option.is_self_negative

                return (
                  <div key={option.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold">
                        {isWinner && '🏆 '}{option.label}
                        {isSelfNegativeBet && <span className="ml-1" style={{ color: 'var(--red)' }}>🚫</span>}
                      </span>
                      <span style={{ color: '#9AA5B8' }}>cuota x{cuota}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--tint)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      {canBet && !isSelfNegativeBet ? (
                        <input
                          type="number"
                          min={0}
                          max={chipsAvailable}
                          value={myChips}
                          onChange={e => setChips(c => ({ ...c, [option.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-[52px] text-center text-xs rounded-lg py-1 outline-none"
                          style={{ border: '1px solid var(--hairline)', color: 'var(--text)' }}
                        />
                      ) : (
                        <span className="text-[11px] w-[38px] text-right" style={{ color: '#9AA5B8' }}>{myChips}f</span>
                      )}
                    </div>
                    {isSelfNegativeBet && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>No puedes apostar contra ti mismo</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
