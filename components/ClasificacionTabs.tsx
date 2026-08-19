'use client'

import { useState } from 'react'

type IndividualRow = { medal: string; name: string; pj: number; deportivo: number; apuestas: number; total: number }
type PairRow = { name: string; pj: number; pg: number; pts: number }
type ApuestasRow = { medal: string; name: string; wins: number; pts: number }

const SEGMENTS = [
  { key: 'individual', label: '🏅 Individual' },
  { key: 'parejas', label: '🤝 Parejas' },
  { key: 'apuestas', label: '💰 Apuestas' },
] as const

type Segment = typeof SEGMENTS[number]['key']

export default function ClasificacionTabs({ individual, parejas, apuestas }: {
  individual: IndividualRow[]
  parejas: PairRow[]
  apuestas: ApuestasRow[]
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
          <div className="grid text-[10px] font-extrabold py-2" style={{ gridTemplateColumns: '1.6fr 0.6fr 0.7fr 0.7fr 0.8fr', color: 'var(--text-muted2)', borderBottom: '1px solid var(--hairline)' }}>
            <span>JUGADOR</span><span>PJ</span><span>DEP</span><span>APU</span><span>TOTAL</span>
          </div>
          {individual.map((row, i) => (
            <div
              key={row.name}
              className="grid text-xs items-center py-2.5"
              style={{ gridTemplateColumns: '1.6fr 0.6fr 0.7fr 0.7fr 0.8fr', borderBottom: i < individual.length - 1 ? '1px solid var(--hairline2)' : undefined }}
            >
              <span className="font-bold">{row.medal} {row.name}</span>
              <span>{row.pj}</span>
              <span>{row.deportivo}</span>
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
          <div className="grid text-[10px] font-extrabold py-2" style={{ gridTemplateColumns: '1.8fr 0.6fr 0.6fr 0.8fr', color: 'var(--text-muted2)', borderBottom: '1px solid var(--hairline)' }}>
            <span>PAREJA</span><span>PJ</span><span>PG</span><span>PTS</span>
          </div>
          {parejas.map((row, i) => (
            <div
              key={row.name}
              className="grid text-xs items-center py-2.5"
              style={{ gridTemplateColumns: '1.8fr 0.6fr 0.6fr 0.8fr', borderBottom: i < parejas.length - 1 ? '1px solid var(--hairline2)' : undefined }}
            >
              <span className="font-bold">{row.name}</span>
              <span>{row.pj}</span>
              <span>{row.pg}</span>
              <span className="font-extrabold" style={{ color: 'var(--accent)' }}>{row.pts}</span>
            </div>
          ))}
          {!parejas.length && (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Aún no hay partidos jugados</div>
          )}
        </div>
      )}

      {seg === 'apuestas' && (
        <div className="rounded-2xl px-3 py-1.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <div className="grid text-[10px] font-extrabold py-2" style={{ gridTemplateColumns: '1.6fr 0.8fr 0.8fr', color: 'var(--text-muted2)', borderBottom: '1px solid var(--hairline)' }}>
            <span>JUGADOR</span><span>1º/2º</span><span>PTS</span>
          </div>
          {apuestas.map((row, i) => (
            <div
              key={row.name}
              className="grid text-xs items-center py-2.5"
              style={{ gridTemplateColumns: '1.6fr 0.8fr 0.8fr', borderBottom: i < apuestas.length - 1 ? '1px solid var(--hairline2)' : undefined }}
            >
              <span className="font-bold">{row.medal} {row.name}</span>
              <span>{row.wins}</span>
              <span className="font-extrabold" style={{ color: 'var(--accent)' }}>{row.pts}</span>
            </div>
          ))}
          {!apuestas.length && (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Aún no hay apuestas resueltas</div>
          )}
        </div>
      )}
    </div>
  )
}
