'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { revalidateLigaData } from '@/lib/actions'
import { friendlyError } from '@/lib/errors'

export type ResponsableRound = { id: string; roundNumber: number; dateLabel: string; bookerId: string; played: boolean }
type PlayerLite = { id: string; name: string }

// Quién reserva la pista de cada jornada. Útil cuando alguien reserva en
// lugar de quien tocaba: el cambio se guarda al elegir y los gastos de
// pista (Perfil) pasan a contarse a nombre de quien reservó de verdad.
export default function ResponsablesReserva({ rounds, players }: { rounds: ResponsableRound[]; players: PlayerLite[] }) {
  const supabase = createClient()
  const [bookers, setBookers] = useState<Record<string, string>>(() => Object.fromEntries(rounds.map(r => [r.id, r.bookerId])))
  const [status, setStatus] = useState<Record<string, 'saving' | 'saved' | string>>({})

  async function change(round: ResponsableRound, newBookerId: string) {
    const previous = bookers[round.id]
    setBookers(b => ({ ...b, [round.id]: newBookerId }))
    setStatus(s => ({ ...s, [round.id]: 'saving' }))

    const { error } = await supabase.from('rounds').update({ court_booker_id: newBookerId || null }).eq('id', round.id)
    if (error) {
      setBookers(b => ({ ...b, [round.id]: previous }))
      setStatus(s => ({ ...s, [round.id]: friendlyError(error.message, 'No se pudo guardar. Inténtalo de nuevo.') }))
      return
    }
    await revalidateLigaData()
    setStatus(s => ({ ...s, [round.id]: 'saved' }))
    setTimeout(() => setStatus(s => (s[round.id] === 'saved' ? { ...s, [round.id]: '' } : s)), 2000)
  }

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
    >
      <div>
        <h2 className="font-heading text-sm font-bold">🏟️ Quién reserva cada jornada</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Si reserva otra persona en lugar de quien tocaba, cámbialo aquí. Se guarda al elegir, y los gastos de pista cuentan a nombre de quien reservó.
        </p>
      </div>

      {!rounds.length && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No hay jornadas en la liga activa.</p>
      )}

      <div className="flex flex-col">
        {rounds.map((r, i) => {
          const st = status[r.id]
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 py-2"
              style={{ borderTop: i > 0 ? '1px solid var(--hairline)' : undefined }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">
                  J{r.roundNumber}{r.played && <span className="font-normal" style={{ color: 'var(--green)' }}> · jugada</span>}
                </p>
                <p className="text-[11px] capitalize" style={{ color: 'var(--text-muted2)' }}>{r.dateLabel}</p>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <select
                  value={bookers[r.id] ?? ''}
                  onChange={e => change(r, e.target.value)}
                  disabled={st === 'saving'}
                  aria-label={`Responsable de la reserva de la jornada ${r.roundNumber}`}
                  className="rounded-lg px-2.5 py-2 text-sm font-bold outline-none disabled:opacity-50"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', minWidth: 120 }}
                >
                  <option value="">Sin asignar</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {st === 'saving' && <span className="text-[11px]" style={{ color: 'var(--text-muted2)' }}>Guardando…</span>}
                {st === 'saved' && <span className="text-[11px] font-bold" style={{ color: 'var(--green)' }}>✓ Guardado</span>}
                {st && st !== 'saving' && st !== 'saved' && <span className="text-[11px]" style={{ color: 'var(--red)' }}>⚠ {st}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
