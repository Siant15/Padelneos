'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingMarket, BettingOption, Profile } from '@/lib/types'

interface Props {
  market: BettingMarket
  userId: string
  chipsLeft: number
  roundStatus: string
  players: Profile[]
}

export default function BettingMarketCard({ market, userId, chipsLeft, roundStatus, players }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Estado local de apuestas pendientes (antes de guardar)
  const myBets = market.bets?.filter(b => b.player_id === userId) ?? []
  const [chips, setChips] = useState<Record<string, number>>(
    Object.fromEntries(myBets.map(b => [b.option_id, b.chips]))
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const canBet = roundStatus === 'scheduled' && !market.resolved
  const totalChipsInMarket = Object.values(chips).reduce((s, v) => s + v, 0)
  const originalChipsInMarket = myBets.reduce((s, b) => s + b.chips, 0)
  const chipsAvailable = chipsLeft + originalChipsInMarket // devuelve las que tenía antes de editar

  // Calcula odds aproximadas de cada opción (pari-mutuel)
  function getTotalChipsOnOption(optionId: string) {
    return market.bets?.filter(b => b.option_id === optionId).reduce((s, b) => s + b.chips, 0) ?? 0
  }

  async function saveBets() {
    if (totalChipsInMarket > chipsAvailable) return
    setSaving(true)

    // Upsert bets
    for (const option of market.options ?? []) {
      const c = chips[option.id] ?? 0
      if (c > 0) {
        await supabase.from('bets').upsert({
          market_id: market.id,
          option_id: option.id,
          player_id: userId,
          chips: c,
        }, { onConflict: 'market_id,option_id,player_id' })
      } else {
        // borrar si se pone a 0
        await supabase.from('bets')
          .delete()
          .match({ market_id: market.id, option_id: option.id, player_id: userId })
      }
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
  }

  const isOverBudget = totalChipsInMarket > chipsAvailable

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full mr-2"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}
          >
            {market.type === 'yes_no' ? 'Sí/No' : market.type === 'player_choice' ? 'Jugador' : 'Cantidad'}
          </span>
          {market.resolved && (
            <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>✓ Resuelta</span>
          )}
        </div>
      </div>

      <p className="font-semibold text-sm mb-3">{market.description}</p>

      {/* Opciones */}
      <div className="space-y-2">
        {market.options?.map(option => {
          const totalOnOption = getTotalChipsOnOption(option.id)
          const isWinner = market.winning_option_id === option.id
          const myChips = chips[option.id] ?? 0

          // Restricción: no apostar contra uno mismo
          // Si la opción tiene player_id y es el usuario actual, y la descripción implica resultado negativo, bloquear
          const isSelfNegativeBet = option.player_id === userId &&
            (market.description.toLowerCase().includes('doble falta') ||
             market.description.toLowerCase().includes('error') ||
             market.description.toLowerCase().includes('perderá'))

          return (
            <div
              key={option.id}
              className="rounded-lg p-3"
              style={{
                background: isWinner ? 'rgba(34,197,94,0.1)' : 'var(--surface2)',
                border: `1px solid ${isWinner ? 'var(--green)' : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">
                  {isWinner && '🏆 '}{option.label}
                  {isSelfNegativeBet && <span className="ml-1 text-xs" style={{ color: 'var(--red)' }}>🚫</span>}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {totalOnOption} fichas totales
                </span>
              </div>

              {canBet && !isSelfNegativeBet && (
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => setChips(c => ({ ...c, [option.id]: Math.max(0, (c[option.id] ?? 0) - 5) }))}
                    className="w-7 h-7 rounded-lg text-sm font-bold transition hover:opacity-80"
                    style={{ background: 'var(--border)' }}
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    max={chipsAvailable}
                    value={myChips}
                    onChange={e => setChips(c => ({ ...c, [option.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-16 text-center text-sm rounded-lg py-1 outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <button
                    onClick={() => setChips(c => ({ ...c, [option.id]: Math.min(chipsAvailable, (c[option.id] ?? 0) + 5) }))}
                    className="w-7 h-7 rounded-lg text-sm font-bold transition hover:opacity-80"
                    style={{ background: 'var(--border)' }}
                  >+</button>
                  <span className="text-xs" style={{ color: 'var(--accent)' }}>
                    {myChips > 0 ? `mis fichas: ${myChips}` : ''}
                  </span>
                </div>
              )}

              {!canBet && myChips > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>
                  Mis fichas: {myChips}
                </p>
              )}

              {isSelfNegativeBet && (
                <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>
                  No puedes apostar contra ti mismo
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Guardar */}
      {canBet && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs" style={{ color: isOverBudget ? 'var(--red)' : 'var(--text-muted)' }}>
            {isOverBudget
              ? `⚠ Te pasas por ${totalChipsInMarket - chipsAvailable} fichas`
              : `${totalChipsInMarket} fichas en este mercado`}
          </span>
          <button
            onClick={saveBets}
            disabled={saving || isOverBudget}
            className="text-sm px-4 py-1.5 rounded-lg font-semibold transition hover:opacity-80 disabled:opacity-40"
            style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}
          >
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}
