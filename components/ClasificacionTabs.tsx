'use client'

import { useState } from 'react'
import Link from 'next/link'
import InfoToggle from '@/components/InfoToggle'
import { formatPoints } from '@/lib/types'

type IndividualRow = { medal: string; playerId: string; name: string; pj: number; pg: number; pe: number; pp: number; apuestas: number; total: number }
type PairRow = { name: string; pj: number; pg: number; pe: number; pp: number; pts: number }
type ApuestasMatrixRow = { name: string; cells: (number | null)[]; total: number }

const SEGMENTS = [
  { key: 'individual', label: '🏅 Individual' },
  { key: 'parejas', label: '🤝 Parejas' },
  { key: 'apuestas', label: '🎯 Aciertos' },
] as const

type Segment = typeof SEGMENTS[number]['key']

export default function ClasificacionTabs({ individual, parejas, apuestasMatrix, apuestasRoundLabels, userId }: {
  individual: IndividualRow[]
  parejas: PairRow[]
  apuestasMatrix: ApuestasMatrixRow[]
  apuestasRoundLabels: string[]
  userId?: string
}) {
  const [seg, setSeg] = useState<Segment>('individual')

  return (
    <div className="flex flex-col gap-3.5">
      <div role="tablist" className="flex rounded-[14px] p-1" style={{ background: 'var(--tint)' }}>
        {SEGMENTS.map(s => (
          <button
            key={s.key}
            role="tab"
            aria-selected={seg === s.key}
            onClick={() => setSeg(s.key)}
            className="flex-1 rounded-[11px] py-2 font-heading font-bold text-xs transition"
            style={{
              background: seg === s.key ? '#fff' : 'transparent',
              color: seg === s.key ? 'var(--accent)' : 'var(--text-muted2)',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {seg === 'individual' && (
        <div className="rounded-2xl px-3 py-1.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <InfoToggle label="Cómo se cuentan los puntos">
            <p>
              🥇🥈🥉 los tres primeros · 🏮 <strong style={{ color: 'var(--text)' }}>farolillo rojo</strong>: el último puesto.
            </p>
            <p>
              🏅 Cada partido reparte <strong style={{ color: 'var(--text)' }}>victoria = 2 pts, empate = 1 pt, derrota = 0 pts</strong> por jugador.
              <strong style={{ color: 'var(--text)' }}> PTS = puntos de partido + APU</strong> (puntos ganados en apuestas).
            </p>
            <p style={{ color: 'var(--text-muted2)' }}>
              PJ jugados · PG ganados · PE empatados · PP perdidos. Si hay empate a PTS, gana quien tenga más puntos de partido; si siguen igual, orden alfabético.
            </p>
          </InfoToggle>
          <div className="grid text-[11px] font-extrabold py-2 mt-1" style={{ gridTemplateColumns: '1.4fr 0.4fr 0.4fr 0.4fr 0.4fr 0.5fr 0.6fr', color: 'var(--text-muted2)', borderBottom: '1px solid var(--hairline)' }}>
            <span>JUGADOR</span><span>PJ</span><span>PG</span><span>PE</span><span>PP</span><span>APU</span><span>PTS</span>
          </div>
          {individual.map((row, i) => {
            const isMe = !!userId && row.playerId === userId
            return (
              <div
                key={row.playerId}
                className="grid text-[13px] items-center py-2.5"
                style={{
                  gridTemplateColumns: '1.4fr 0.4fr 0.4fr 0.4fr 0.4fr 0.5fr 0.6fr',
                  borderBottom: i < individual.length - 1 ? '1px solid var(--hairline2)' : undefined,
                  background: isMe ? 'var(--tint)' : undefined,
                }}
              >
                <Link href={`/jugador/${row.playerId}`} className="font-bold truncate" style={{ color: 'var(--text)' }} title={row.medal === '🏮' ? 'Farolillo rojo (último puesto)' : undefined}>
                  {row.medal} {row.name}{isMe && <span className="font-normal" style={{ color: 'var(--text-muted2)' }}> (tú)</span>}
                </Link>
                <span>{row.pj}</span>
                <span>{row.pg}</span>
                <span>{row.pe}</span>
                <span>{row.pp}</span>
                <span>{formatPoints(row.apuestas)}</span>
                <span className="font-extrabold" style={{ color: 'var(--accent)' }}>{formatPoints(row.total)}</span>
              </div>
            )
          })}
          {!individual.length && (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Aún no hay partidos jugados</div>
          )}
        </div>
      )}

      {seg === 'parejas' && (
        <div className="rounded-2xl px-3 py-1.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <InfoToggle label="Qué muestra la clasificación de parejas">
            <p>🎾 Todas las parejas posibles entre los jugadores registrados. PJ jugados · PG ganados · PE empatados · PP perdidos.</p>
          </InfoToggle>
          <div className="grid text-[11px] font-extrabold py-2 mt-1" style={{ gridTemplateColumns: '1.5fr 0.45fr 0.45fr 0.45fr 0.45fr 0.6fr', color: 'var(--text-muted2)', borderBottom: '1px solid var(--hairline)' }}>
            <span>PAREJA</span><span>PJ</span><span>PG</span><span>PE</span><span>PP</span><span>PTS</span>
          </div>
          {parejas.map((row, i) => (
            <div
              key={row.name}
              className="grid text-[13px] items-center py-2.5"
              style={{ gridTemplateColumns: '1.5fr 0.45fr 0.45fr 0.45fr 0.45fr 0.6fr', borderBottom: i < parejas.length - 1 ? '1px solid var(--hairline2)' : undefined }}
            >
              <span className="font-bold">{row.name}</span>
              <span>{row.pj}</span>
              <span>{row.pg}</span>
              <span>{row.pe}</span>
              <span>{row.pp}</span>
              <span className="font-extrabold" style={{ color: 'var(--accent)' }}>{formatPoints(row.pts)}</span>
            </div>
          ))}
          {!parejas.length && (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Aún no hay partidos jugados</div>
          )}
        </div>
      )}

      {seg === 'apuestas' && (
        <div className="rounded-2xl py-1.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          {!apuestasMatrix.length ? (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Aún no hay jornadas liquidadas</div>
          ) : (
            <>
              <div className="px-3">
                <InfoToggle label="Cómo se ganan los puntos de apuestas">
                  <p>
                    🎯 Puntos que cada jugador ganó con sus apuestas en cada jornada: el mejor apostador suma <strong style={{ color: 'var(--text)' }}>+1</strong> y el segundo <strong style={{ color: 'var(--text)' }}>+0,5</strong>. «·» = sin puntos o jornada aún sin liquidar. Desliza para ver más jornadas; el total (PTS) queda siempre a la derecha.
                  </p>
                </InfoToggle>
              </div>
              <div className="overflow-x-auto mt-1" style={{ scrollbarWidth: 'thin' }}>
                <table className="text-[13px] w-full" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                      <th className="text-left text-[11px] font-extrabold py-2 pl-3.5 pr-3 sticky left-0" style={{ color: 'var(--text-muted2)', background: 'var(--surface)' }}>JUGADOR</th>
                      {apuestasRoundLabels.map(label => (
                        <th key={label} className="text-[11px] font-extrabold py-2 px-2 text-center" style={{ color: 'var(--text-muted2)' }}>{label}</th>
                      ))}
                      <th className="text-[11px] font-extrabold py-2 pl-3 pr-3.5 text-right sticky right-0" style={{ color: 'var(--text-muted2)', background: 'var(--surface)', boxShadow: '-6px 0 6px -6px rgba(0,0,0,0.15)' }}>PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apuestasMatrix.map((row, i) => (
                      <tr key={row.name} style={{ borderBottom: i < apuestasMatrix.length - 1 ? '1px solid var(--hairline2)' : undefined }}>
                        <td className="font-bold py-2.5 pl-3.5 pr-3 whitespace-nowrap sticky left-0" style={{ background: 'var(--surface)' }}>{row.name}</td>
                        {row.cells.map((cell, j) => (
                          <td key={j} className="py-2.5 px-2 text-center" style={{ color: cell ? 'var(--accent)' : 'var(--text-muted2)' }}>
                            {cell === null ? '·' : formatPoints(cell)}
                          </td>
                        ))}
                        <td className="font-extrabold py-2.5 pl-3 pr-3.5 text-right sticky right-0" style={{ color: 'var(--accent)', background: 'var(--surface)', boxShadow: '-6px 0 6px -6px rgba(0,0,0,0.15)' }}>{formatPoints(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
