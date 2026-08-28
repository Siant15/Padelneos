'use client'

import { useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/Avatar'

type PlayerAvatar = { name: string; avatarUrl: string | null }

export type JornadaViewModel = {
  id: string
  roundNumber: number
  numLabel: string
  rawDate: string | null
  dateLabel: string
  timeLabel: string
  clubLabel: string
  pairALabel: string
  pairBLabel: string
  pairAPlayers: PlayerAvatar[]
  pairBPlayers: PlayerAvatar[]
  responsableName: string
  responsableAvatarUrl: string | null
  reservaStatus: 'pendiente' | 'reservada' | 'finalizada'
  played: boolean
  isNext: boolean
  statusLabel: string
  tagBg: string
  tagColor: string
  scoreLabel: string
  winnerLabel: string
  stats: { name: string; line: string }[]
  betWinner: string
  betSecond: string
}

export default function JornadasAccordion({ items }: { items: JornadaViewModel[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(items.filter(i => i.isNext).map(i => i.id)))

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map(j => {
        const isOpen = expanded.has(j.id)
        return (
          <div
            key={j.id}
            className="rounded-2xl px-3.5 py-3"
            style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
          >
            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggle(j.id)}>
              <div>
                <div className="text-[13px] font-extrabold capitalize">
                  Jornada {j.numLabel} · {j.dateLabel}{j.timeLabel && ` · ${j.timeLabel}`}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs" style={{ color: 'var(--text-muted2)' }}>
                  {j.pairAPlayers.length ? (
                    <>
                      <PairAvatars players={j.pairAPlayers} />
                      <span>{j.pairALabel}</span>
                      {j.pairBPlayers.length > 0 && (
                        <>
                          <span>vs</span>
                          <PairAvatars players={j.pairBPlayers} />
                          <span>{j.pairBLabel}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <span>{j.pairALabel}</span>
                  )}
                </div>
              </div>
              <span
                className="text-[10px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap"
                style={{ background: j.tagBg, color: j.tagColor }}
              >
                {j.statusLabel}
              </span>
            </div>

            {isOpen && (
              <div
                className="mt-2.5 pt-2.5 text-xs flex flex-col gap-1.5"
                style={{ borderTop: '1px dashed #EEE', color: '#555' }}
              >
                <div className="flex items-center gap-1.5">
                  🏟️ Reserva: <Avatar name={j.responsableName} avatarUrl={j.responsableAvatarUrl} size={18} /> {j.responsableName}
                </div>
                {j.clubLabel && (
                  <div>📍 Club: {j.clubLabel}</div>
                )}

                {j.played && (
                  <>
                    <div>🎾 Resultado: <strong>{j.scoreLabel}</strong> ({j.winnerLabel})</div>
                    <div className="flex flex-col gap-0.5 mt-0.5 rounded-[10px] px-2.5 py-2" style={{ background: '#FAFAF7' }}>
                      {j.stats.map(s => (
                        <div key={s.name} className="flex justify-between">
                          <span>{s.name}</span>
                          <span style={{ color: 'var(--text-muted2)' }}>{s.line}</span>
                        </div>
                      ))}
                    </div>
                    {j.betWinner && (
                      <div>💰 Mejor apostador: <strong>{j.betWinner}</strong> (+1){j.betSecond && ` · ${j.betSecond} (+0.5)`}</div>
                    )}
                  </>
                )}

                {!j.played && (
                  <>
                    {j.isNext && (
                      <div>
                        💰 Mercado de apuestas abierto —{' '}
                        <Link href={`/liga?tab=apuestas&round=${j.id}`} className="font-bold" style={{ color: 'var(--accent)' }}>apostar en esta jornada</Link>.
                      </div>
                    )}
                    <div className="flex gap-2 mt-1">
                      <Link
                        href={`/admin/jornadas/${j.id}/editar`}
                        className="flex-1 text-center text-xs font-bold py-2 rounded-xl"
                        style={{ background: 'var(--tint)', color: '#555' }}
                      >
                        ✏️ Editar
                      </Link>
                      <Link
                        href={`/admin/jornadas/${j.id}/resultado`}
                        className="flex-1 text-center text-xs font-bold py-2 rounded-xl"
                        style={{ background: 'var(--tint)', color: '#555' }}
                      >
                        📝 Resultado
                      </Link>
                      <Link
                        href={`/liga?tab=apuestas&round=${j.id}`}
                        className="flex-1 text-center text-xs font-bold py-2 rounded-xl"
                        style={{ background: 'var(--surface2)', color: 'var(--accent)' }}
                      >
                        🎰 Apuestas
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PairAvatars({ players }: { players: PlayerAvatar[] }) {
  return (
    <span className="flex -space-x-1.5 shrink-0">
      {players.map((p, i) => (
        <span key={i} style={{ zIndex: players.length - i }}>
          <Avatar name={p.name} avatarUrl={p.avatarUrl} size={18} />
        </span>
      ))}
    </span>
  )
}
