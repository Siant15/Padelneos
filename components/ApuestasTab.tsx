'use client'

import { useState } from 'react'
import type { RoundActa } from '@/lib/betting-queries'
import type { BettingMarket } from '@/lib/types'
import { DAYS_ES, formatTime } from '@/lib/types'
import ApuestasActa from '@/components/ApuestasActa'
import BettingMarketsBoard from '@/components/BettingMarketsBoard'

export type FinishedActaEntry = { roundId: string; roundNumber: number; acta: RoundActa }
export type ActiveRoundData = {
  roundId: string
  roundNumber: number
  pair1Label: string | null
  pair2Label: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  club: string | null
  markets: BettingMarket[]
  chipsLeft: number
  jackpotByTemplate: Record<string, number>
} | null

// Pantalla "acta de apuestas" de Liga → Apuestas: nunca navega a otra
// página al cambiar de jornada o de modo — todo viene precalculado
// desde el servidor y se conmuta con estado local.
export default function ApuestasTab({ userId, finishedRounds, activeRound }: {
  userId: string
  finishedRounds: FinishedActaEntry[]
  activeRound: ActiveRoundData
}) {
  const sorted = [...finishedRounds].sort((a, b) => a.roundNumber - b.roundNumber)
  const lastFinished = sorted[sorted.length - 1] ?? null

  const [mode, setMode] = useState<'finished' | 'active'>(lastFinished ? 'finished' : activeRound ? 'active' : 'finished')
  const [selectedId, setSelectedId] = useState<string>(lastFinished?.roundId ?? '')
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!lastFinished && !activeRound) {
    return (
      <div className="rounded-2xl p-6 text-center text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
        Todavía no hay jornadas con apuestas.
      </div>
    )
  }

  const index = sorted.findIndex(r => r.roundId === selectedId)
  const current = index === -1 ? lastFinished : sorted[index]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl p-1 gap-1" style={{ background: 'var(--tint)' }}>
          <button
            type="button"
            onClick={() => setMode('finished')}
            disabled={!lastFinished}
            className="rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-40"
            style={{ background: mode === 'finished' ? '#fff' : 'transparent', color: mode === 'finished' ? 'var(--accent)' : 'var(--text-muted2)' }}
          >
            {mode === 'finished' && '✓ '}Última terminada
          </button>
          <button
            type="button"
            onClick={() => setMode('active')}
            disabled={!activeRound}
            className="rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-40"
            style={{ background: mode === 'active' ? '#fff' : 'transparent', color: mode === 'active' ? 'var(--accent)' : 'var(--text-muted2)' }}
          >
            {mode === 'active' && '✓ '}Jornada activa
          </button>
        </div>

        {mode === 'finished' && current && sorted.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => index > 0 && setSelectedId(sorted[index - 1].roundId)}
              disabled={index <= 0}
              className="w-7 h-7 rounded-lg font-bold disabled:opacity-30"
              style={{ background: 'var(--tint)' }}
              aria-label="Jornada anterior"
            >
              ‹
            </button>
            <span
              className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
              style={{ border: '1px solid var(--orange)', color: 'var(--orange)' }}
            >
              J{current.roundNumber} · Finalizada
            </span>
            <button
              type="button"
              onClick={() => index < sorted.length - 1 && setSelectedId(sorted[index + 1].roundId)}
              disabled={index === -1 || index >= sorted.length - 1}
              className="w-7 h-7 rounded-lg font-bold disabled:opacity-30"
              style={{ background: 'var(--tint)' }}
              aria-label="Jornada siguiente"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {mode === 'finished' && current && (
        <>
          <JornadaHeader
            roundNumber={current.roundNumber}
            pair1Label={current.acta.pair1Label}
            pair2Label={current.acta.pair2Label}
            scoreLabel={current.acta.scoreLabel}
            scheduledDate={current.acta.round?.scheduledDate ?? null}
            scheduledTime={current.acta.round?.scheduledTime ?? null}
            club={current.acta.round?.club ?? null}
          />
          <ApuestasActa markets={current.acta.markets} standings={current.acta.standings} />
        </>
      )}

      {mode === 'active' && activeRound && (
        <>
          <JornadaHeader
            roundNumber={activeRound.roundNumber}
            pair1Label={activeRound.pair1Label}
            pair2Label={activeRound.pair2Label}
            scoreLabel={null}
            scheduledDate={activeRound.scheduledDate}
            scheduledTime={activeRound.scheduledTime}
            club={activeRound.club}
          />
          <div className="rounded-2xl px-4 pt-4 pb-1" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            <h2 className="font-heading font-bold text-sm mb-2.5">Apuestas de la jornada</h2>
            <BettingMarketsBoard
              markets={activeRound.markets}
              userId={userId}
              chipsLeft={activeRound.chipsLeft}
              roundStatus="scheduled"
              round={{ scheduled_date: activeRound.scheduledDate, scheduled_time: activeRound.scheduledTime }}
              jackpotByTemplate={activeRound.jackpotByTemplate}
            />
          </div>
        </>
      )}

      {sorted.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setHistoryOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold"
            style={{ color: 'var(--text-muted)' }}
          >
            Ver otras jornadas <span aria-hidden>{historyOpen ? '︿' : '⌄'}</span>
          </button>
          {historyOpen && (
            <div className="flex gap-2 overflow-x-auto pt-2.5 pb-1" style={{ scrollbarWidth: 'none' }}>
              {sorted.map(r => (
                <button
                  key={r.roundId}
                  type="button"
                  onClick={() => { setMode('finished'); setSelectedId(r.roundId) }}
                  className="shrink-0 rounded-xl px-3.5 py-2 font-bold text-[13px] transition"
                  style={{
                    background: r.roundId === selectedId && mode === 'finished' ? 'var(--green-bg)' : 'var(--tint)',
                    color: r.roundId === selectedId && mode === 'finished' ? 'var(--green)' : 'var(--text-muted2)',
                  }}
                >
                  J{r.roundNumber}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export function JornadaHeader({ roundNumber, pair1Label, pair2Label, scoreLabel, scheduledDate, scheduledTime, club }: {
  roundNumber: number
  pair1Label: string | null
  pair2Label: string | null
  scoreLabel: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  club: string | null
}) {
  const dayLabel = scheduledDate ? DAYS_ES[new Date(scheduledDate + 'T12:00:00').getDay()] : null
  const matchLabel = pair1Label && pair2Label ? `${pair1Label} ${scoreLabel ?? 'vs.'} ${pair2Label}` : null
  return (
    <div className="px-1">
      <p className="font-heading font-bold text-[15px]">
        J{roundNumber}{matchLabel ? ` · ${matchLabel}` : ''}
      </p>
      {(dayLabel || scheduledTime || club) && (
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {[dayLabel, scheduledTime ? formatTime(scheduledTime) : null, club].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}
