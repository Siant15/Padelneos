'use client'

import { useState } from 'react'

type IndividualRow = { medal: string; name: string; pj: number; pg: number; pe: number; pp: number; apuestas: number; total: number }
type PairRow = { name: string; pj: number; pg: number; pe: number; pp: number; pts: number }
type ApuestasMatrixRow = { name: string; cells: (number | null)[]; total: number }

const SEGMENTS = [
  { key: 'individual', label: '🏅 Individual' },
  { key: 'parejas', label: '🤝 Parejas' },
  { key: 'apuestas', label: '💰 Apuestas' },
] as const

type Segment = typeof SEGMENTS[number]['key']

export default function ClasificacionTabs({ individual, parejas, apuestasMatrix, apuestasRoundLabels }: {
  individual: IndividualRow[]
  parejas: PairRow[]
  apuestasMatrix: ApuestasMatrixRow[]
  apuestasRoundLabels: string[]
}) {
  const [seg, setSeg] = useState<Segment>('individual')

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex rounded-[14px] p-1" style={{ background: 'var(--tint)' }}>
        {SEGMENTS.map(s => (
          <button
            key={s.key}
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
          <p className="text-[11px] pt-2 px-0.5" style={{ color: 'var(--text-muted)' }}>
            🏅 Cada partido reparte <strong style={{ color: 'var(--text)' }}>victoria = 2 pts, empate = 1 pt, derrota = 0 pts</strong> por jugador.
          </p>
          <div className="grid text-[9.5px] font-extrabold py-2 mt-1" style={{ gridTemplateColumns: '1.4fr 0.4fr 0.4fr 0.4fr 0.4fr 0.5fr 0.6fr', color: 'var(--text-muted2)', borderBottom: '1px solid var(--hairline)' }}>
            <span>JUGADOR</span><span>PJ</span><span>PG</span><span>PE</span><span>PP</span><span>APU</span><span>PTS</span>
          </div>
          {individual.map((row, i) => (
            <div
              key={row.name}
              className="grid text-xs items-center py-2.5"
              style={{ gridTemplateColumns: '1.4fr 0.4fr 0.4fr 0.4fr 0.4fr 0.5fr 0.6fr', borderBottom: i < individual.length - 1 ? '1px solid var(--hairline2)' : undefined }}
            >
              <span className="font-bold">{row.medal} {row.name}</span>
              <span>{row.pj}</span>
              <span>{row.pg}</span>
              <span>{row.pe}</span>
              <span>{row.pp}</span>
              <span>{row.apuestas}</span>
              <span className="font-extrabold" style={{ color: 'var(--accent)' }}>{row.total}</span>
            </div>
          ))}
          {!individual.length && (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Aún no hay partidos jugados</div>
          )}
        </div>
      )}

      {seg === 'parejas' && (
        <div className="rounded-2xl px-3 py-1.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <p className="text-[11px] pt-2 px-0.5" style={{ color: 'var(--text-muted)' }}>
            🎾 Todas las parejas posibles entre los jugadores registrados.
          </p>
          <div className="grid text-[10px] font-extrabold py-2 mt-1" style={{ gridTemplateColumns: '1.5fr 0.45fr 0.45fr 0.45fr 0.45fr 0.6fr', color: 'var(--text-muted2)', borderBottom: '1px solid var(--hairline)' }}>
            <span>PAREJA</span><span>PJ</span><span>PG</span><span>PE</span><span>PP</span><span>PTS</span>
          </div>
          {parejas.map((row, i) => (
            <div
              key={row.name}
              className="grid text-xs items-center py-2.5"
              style={{ gridTemplateColumns: '1.5fr 0.45fr 0.45fr 0.45fr 0.45fr 0.6fr', borderBottom: i < parejas.length - 1 ? '1px solid var(--hairline2)' : undefined }}
            >
              <span className="font-bold">{row.name}</span>
              <span>{row.pj}</span>
              <span>{row.pg}</span>
              <span>{row.pe}</span>
              <span>{row.pp}</span>
              <span className="font-extrabold" style={{ color: 'var(--accent)' }}>{row.pts}</span>
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
            <div className="overflow-x-auto px-3" style={{ scrollbarWidth: 'thin' }}>
              <table className="text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <th className="text-left font-extrabold py-2 pr-3 sticky left-0" style={{ color: 'var(--text-muted2)', background: 'var(--surface)' }}>JUGADOR</th>
                    {apuestasRoundLabels.map(label => (
                      <th key={label} className="font-extrabold py-2 px-2 text-center" style={{ color: 'var(--text-muted2)' }}>{label}</th>
                    ))}
                    <th className="font-extrabold py-2 pl-3 text-right" style={{ color: 'var(--text-muted2)' }}>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {apuestasMatrix.map((row, i) => (
                    <tr key={row.name} style={{ borderBottom: i < apuestasMatrix.length - 1 ? '1px solid var(--hairline2)' : undefined }}>
                      <td className="font-bold py-2.5 pr-3 whitespace-nowrap sticky left-0" style={{ background: 'var(--surface)' }}>{row.name}</td>
                      {row.cells.map((cell, j) => (
                        <td key={j} className="py-2.5 px-2 text-center" style={{ color: cell ? 'var(--accent)' : 'var(--text-muted2)' }}>
                          {cell ? cell : '·'}
                        </td>
                      ))}
                      <td className="font-extrabold py-2.5 pl-3 text-right" style={{ color: 'var(--accent)' }}>{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
