'use client'

import { useState } from 'react'
import type { RoundActa } from '@/lib/betting-queries'
import type { BettingMarket, BettingQuestionTemplate } from '@/lib/types'
import { DAYS_ES, formatTime } from '@/lib/types'
import ApuestasActa from '@/components/ApuestasActa'
import BettingMarketsBoard from '@/components/BettingMarketsBoard'
import ApuestasInfo from '@/components/ApuestasInfo'
import AddQuestionPicker from '@/components/AddQuestionPicker'

type BaseRound = { roundId: string; roundNumber: number; pair1Label: string | null; pair2Label: string | null; scheduledDate: string | null; scheduledTime: string | null; club: string | null }

export type SettledRoundEntry = { kind: 'settled'; roundId: string; roundNumber: number; acta: RoundActa }
export type OpenRoundEntry = BaseRound & { kind: 'open'; markets: BettingMarket[]; chipsLeft: number; jackpotByTemplate: Record<string, number>; availableTemplates: BettingQuestionTemplate[] }
export type PendingRoundEntry = BaseRound & { kind: 'pending'; reason: 'awaiting_settlement' | 'no_questions' }
export type ApuestasRoundEntry = SettledRoundEntry | OpenRoundEntry | PendingRoundEntry

const STATUS_LABEL: Record<ApuestasRoundEntry['kind'], string> = {
  settled: 'Finalizada',
  open: 'Activa',
  pending: 'Pendiente',
}
const STATUS_COLOR: Record<ApuestasRoundEntry['kind'], string> = {
  settled: 'var(--orange)',
  open: 'var(--accent)',
  pending: 'var(--text-muted2)',
}

// Pantalla "acta de apuestas" de Liga → Apuestas: nunca navega a otra
// página al cambiar de jornada — todo viene precalculado desde el
// servidor (para TODAS las jornadas de la temporada, liquidadas,
// abiertas o pendientes) y se conmuta con estado local.
export default function ApuestasTab({ userId, rounds, initialRoundId }: { userId: string; rounds: ApuestasRoundEntry[]; initialRoundId?: string }) {
  const sorted = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber)
  const settled = sorted.filter((r): r is SettledRoundEntry => r.kind === 'settled')
  const open = sorted.filter((r): r is OpenRoundEntry => r.kind === 'open')
  const lastSettled = settled[settled.length - 1] ?? null
  const firstOpen = open[0] ?? null

  const requestedExists = initialRoundId && sorted.some(r => r.roundId === initialRoundId)
  const defaultId = (requestedExists ? initialRoundId : null) ?? lastSettled?.roundId ?? firstOpen?.roundId ?? sorted[0]?.roundId ?? ''
  const [selectedId, setSelectedId] = useState(defaultId)
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!sorted.length) {
    return (
      <div className="rounded-2xl p-6 text-center text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
        Todavía no hay jornadas con apuestas.
      </div>
    )
  }

  const index = sorted.findIndex(r => r.roundId === selectedId)
  const current = index === -1 ? sorted[0] : sorted[index]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <span className="font-heading text-sm font-bold">Apuestas de la liga</span>
        <ApuestasInfo />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl p-1 gap-1" style={{ background: 'var(--tint)' }}>
          <button
            type="button"
            onClick={() => lastSettled && setSelectedId(lastSettled.roundId)}
            disabled={!lastSettled}
            className="rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-40"
            style={{ background: current.kind === 'settled' ? '#fff' : 'transparent', color: current.kind === 'settled' ? 'var(--accent)' : 'var(--text-muted2)' }}
          >
            {current.kind === 'settled' && '✓ '}Última terminada
          </button>
          <button
            type="button"
            onClick={() => firstOpen && setSelectedId(firstOpen.roundId)}
            disabled={!firstOpen}
            className="rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-40"
            style={{ background: current.kind === 'open' ? '#fff' : 'transparent', color: current.kind === 'open' ? 'var(--accent)' : 'var(--text-muted2)' }}
          >
            {current.kind === 'open' && '✓ '}Jornada activa
          </button>
        </div>

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
            style={{ border: `1px solid ${STATUS_COLOR[current.kind]}`, color: STATUS_COLOR[current.kind] }}
          >
            J{current.roundNumber} · {STATUS_LABEL[current.kind]}
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
      </div>

      {current.kind === 'settled' && (
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

      {current.kind === 'open' && (
        <>
          <JornadaHeader
            roundNumber={current.roundNumber}
            pair1Label={current.pair1Label}
            pair2Label={current.pair2Label}
            scoreLabel={null}
            scheduledDate={current.scheduledDate}
            scheduledTime={current.scheduledTime}
            club={current.club}
          />
          <div className="rounded-2xl px-4 pt-4 pb-1" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            <h2 className="font-heading font-bold text-sm mb-2.5">Apuestas de la jornada</h2>
            <BettingMarketsBoard
              markets={current.markets}
              userId={userId}
              chipsLeft={current.chipsLeft}
              roundStatus="scheduled"
              round={{ scheduled_date: current.scheduledDate, scheduled_time: current.scheduledTime }}
              jackpotByTemplate={current.jackpotByTemplate}
            />
          </div>
          {current.availableTemplates.length > 0 && (
            <AddQuestionPicker roundId={current.roundId} templates={current.availableTemplates} />
          )}
        </>
      )}

      {current.kind === 'pending' && (
        <>
          <JornadaHeader
            roundNumber={current.roundNumber}
            pair1Label={current.pair1Label}
            pair2Label={current.pair2Label}
            scoreLabel={null}
            scheduledDate={current.scheduledDate}
            scheduledTime={current.scheduledTime}
            club={current.club}
          />
          <div className="rounded-2xl p-5 text-center text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            {current.reason === 'awaiting_settlement'
              ? 'Jornada pendiente de liquidar.'
              : 'Todavía no se han generado las preguntas de apuestas para esta jornada.'}
          </div>
        </>
      )}

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
                onClick={() => setSelectedId(r.roundId)}
                className="shrink-0 rounded-xl px-3.5 py-2 font-bold text-[13px] transition"
                style={{
                  background: r.roundId === selectedId ? 'var(--green-bg)' : 'var(--tint)',
                  color: r.roundId === selectedId ? 'var(--green)' : 'var(--text-muted2)',
                }}
              >
                J{r.roundNumber}
              </button>
            ))}
          </div>
        )}
      </section>
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
