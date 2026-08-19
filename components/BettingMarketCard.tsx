'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingMarket } from '@/lib/types'

interface Props {
  market: BettingMarket
  userId: string
  chipsLeft: number
  roundStatus: string
}

const OPTION_COLORS = ['#2E6FF2', '#FF8A3D', '#2BB673', '#FFC93D', '#9AA5B8']
const TYPE_ICON: Record<string, string> = { yes_no: '🎾', player_choice: '🎯', quantity: '🔢' }

export default function BettingMarketCard({ market, userId, chipsLeft, roundStatus }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const myBets = market.bets?.filter(b => b.player_id === userId) ?? []
  const [chips, setChips] = useState<Record<string, number>>(
    Object.fromEntries(myBets.map(b => [b.option_id, b.chips]))
  )
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canBet = roundStatus === 'scheduled' && !market.resolved
  const totalChipsInMarket = Object.values(chips).reduce((s, v) => s + v, 0)
  const originalChipsInMarket = myBets.reduce((s, b) => s + b.chips, 0)
  const chipsAvailable = chipsLeft + originalChipsInMarket

  function getTotalChipsOnOption(optionId: string) {
    return market.bets?.filter(b => b.option_id === optionId).reduce((s, b) => s + b.chips, 0) ?? 0
  }

  const totalMarketChips = (market.options ?? []).reduce((s, o) => s + getTotalChipsOnOption(o.id), 0)

  async function saveBets() {
    if (totalChipsInMarket > chipsAvailable) return
    setSaving(true)
    setError('')

    const options = market.options ?? []
    const toUpsert = options
      .filter(o => (chips[o.id] ?? 0) > 0)
      .map(o => ({ market_id: market.id, option_id: o.id, player_id: userId, chips: chips[o.id] }))
    const toDelete = options.filter(o => (chips[o.id] ?? 0) === 0 && myBets.some(b => b.option_id === o.id))

    if (toUpsert.length) {
      const { error: upsertError } = await supabase.from('bets').upsert(toUpsert, { onConflict: 'market_id,option_id,player_id' })
      if (upsertError) {
        setError(upsertError.message.includes('Límite') ? upsertError.message : 'No se pudo guardar la apuesta')
        setSaving(false)
        return
      }
    }

    for (const option of toDelete) {
      const { error: deleteError } = await supabase.from('bets')
        .delete()
        .match({ market_id: market.id, option_id: option.id, player_id: userId })
      if (deleteError) {
        setError('No se pudo actualizar la apuesta')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  const isOverBudget = totalChipsInMarket > chipsAvailable

  return (
    <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center justify-between">
        <div className="font-heading font-bold text-[13px]">
          {TYPE_ICON[market.type] ?? '🎾'} {market.description}
        </div>
        {market.resolved && <span className="text-xs font-bold" style={{ color: 'var(--green)' }}>✓</span>}
      </div>

      <div className="flex flex-col gap-2 mt-2.5">
        {market.options?.map((option, idx) => {
          const totalOnOption = getTotalChipsOnOption(option.id)
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
                {canBet && editing && !isSelfNegativeBet ? (
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

      {canBet && (
        <div className="mt-3 flex flex-col gap-1.5">
          {error && <p className="text-[11px]" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: isOverBudget ? 'var(--red)' : 'var(--text-muted2)' }}>
              {isOverBudget ? `⚠ Te pasas por ${totalChipsInMarket - chipsAvailable} fichas` : `${totalChipsInMarket} fichas`}
            </span>
            {editing ? (
              <button
                onClick={saveBets}
                disabled={saving || isOverBudget}
                className="font-heading text-xs px-3.5 py-1.5 rounded-xl font-bold transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {saving ? 'Guardando...' : 'Listo'}
              </button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="font-heading text-xs px-3.5 py-1.5 rounded-xl font-bold transition hover:opacity-90"
                style={{ background: 'var(--tint)', color: '#555' }}
              >
                Editar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
