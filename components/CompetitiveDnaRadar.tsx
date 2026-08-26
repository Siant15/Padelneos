'use client'

import { useEffect, useState } from 'react'
import { DNA_AXES, type DnaAxisKey } from '@/lib/dna'
import type { PlayerDna } from '@/lib/dna-data'

const CENTER = 100
const MAX_R = 78
const LABEL_R = 95

function point(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) }
}

function anglesFor() {
  return DNA_AXES.map((_, i) => -90 + i * 60)
}

function polygonPoints(values: Record<DnaAxisKey, number>) {
  return anglesFor()
    .map((angle, i) => point(angle, (values[DNA_AXES[i].key] / 100) * MAX_R))
    .map(p => `${p.x},${p.y}`)
    .join(' ')
}

// Rejilla de referencia: hexágonos concéntricos en 25/50/75/100, con el
// de 50 remarcado (discontinuo) como "Ref. nivel 2–3".
function gridPolygon(radiusPct: number) {
  return anglesFor().map(angle => point(angle, (radiusPct / 100) * MAX_R)).map(p => `${p.x},${p.y}`).join(' ')
}

export default function CompetitiveDnaRadar({ players, viewerId, seasonLabel }: {
  players: PlayerDna[]
  viewerId: string
  seasonLabel: string
}) {
  const viewer = players.find(p => p.playerId === viewerId)
  const others = players.filter(p => p.playerId !== viewerId)

  const [compareId, setCompareId] = useState<string>('none')
  const [openAxis, setOpenAxis] = useState<DnaAxisKey | null>(null)
  const [howOpen, setHowOpen] = useState(false)

  useEffect(() => {
    if (!howOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setHowOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [howOpen])

  if (!viewer) return null

  const compare = compareId !== 'none' ? others.find(p => p.playerId === compareId) : null

  const viewerValues = Object.fromEntries(DNA_AXES.map(a => [a.key, viewer.axes[a.key].value])) as Record<DnaAxisKey, number>
  const compareValues = compare
    ? (Object.fromEntries(DNA_AXES.map(a => [a.key, compare.axes[a.key].value])) as Record<DnaAxisKey, number>)
    : null

  const activeAxis = openAxis ? DNA_AXES.find(a => a.key === openAxis) ?? null : null
  const activeInsufficient = openAxis ? viewer.axes[openAxis].insufficient : false

  return (
    <section
      className="rounded-2xl p-4 mb-5"
      style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
      aria-label="ADN competitivo"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-heading font-bold text-sm">🧬 ADN competitivo</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Se actualiza después de cada jornada</p>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setHowOpen(v => !v)}
            aria-expanded={howOpen}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-full"
            style={{ background: 'var(--tint)', color: 'var(--accent)' }}
          >
            ¿Cómo se calcula?
          </button>
          {howOpen && (
            <>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setHowOpen(false)}
                className="fixed inset-0 z-40"
                style={{ background: 'transparent' }}
              />
              <div
                role="dialog"
                aria-label="Cómo se calcula el ADN competitivo"
                className="absolute right-0 top-9 z-50 w-72 rounded-xl p-3 text-left"
                style={{ background: 'var(--surface)', boxShadow: '0 6px 20px rgba(0,0,0,0.14)', border: '1px solid var(--border)' }}
              >
                <p className="text-[11px] font-bold mb-2" style={{ color: 'var(--text-muted2)' }}>Cómo se calcula</p>
                <ul className="flex flex-col gap-1.5 text-[11px]" style={{ color: 'var(--text)' }}>
                  {DNA_AXES.map(a => (
                    <li key={a.key}><strong>{a.label}:</strong> {a.formula}</li>
                  ))}
                </ul>
                <p className="text-[11px] mt-2.5 pt-2" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--hairline)' }}>
                  Todos los valores se muestran sobre 100. La línea gris marca la referencia neutral 50 del nivel 2–3.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-[10.5px] font-bold mt-2 mb-2.5" style={{ color: 'var(--text-muted2)' }}>
        Temporada actual · {seasonLabel}
      </p>

      {others.length > 0 && (
        <label className="flex items-center gap-2 mb-3 text-[11px] font-bold" style={{ color: 'var(--text-muted2)' }}>
          COMPARAR CON
          <select
            value={compareId}
            onChange={e => setCompareId(e.target.value)}
            className="flex-1 rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="none">Nadie</option>
            {others.map(p => <option key={p.playerId} value={p.playerId}>{p.playerName}</option>)}
          </select>
        </label>
      )}

      <div className="relative mx-auto" style={{ width: '100%', maxWidth: 280, aspectRatio: '1 / 1' }}>
        <svg viewBox="0 0 200 200" className="w-full h-full" role="img" aria-labelledby="dna-radar-title dna-radar-desc">
          <title id="dna-radar-title">Radar de ADN competitivo de {viewer.playerName}</title>
          <desc id="dna-radar-desc">
            {DNA_AXES.map(a => `${a.label} ${viewer.axes[a.key].value} de 100`).join(', ')}
            {compare && compareValues ? `. Comparado con ${compare.playerName}: ${DNA_AXES.map(a => `${a.label} ${compare.axes[a.key].value}`).join(', ')}` : ''}
          </desc>

          {[25, 50, 75, 100].map(pct => (
            <polygon
              key={pct}
              points={gridPolygon(pct)}
              fill="none"
              stroke={pct === 50 ? 'var(--text-muted2)' : 'var(--hairline)'}
              strokeWidth={pct === 50 ? 1.3 : 1}
              strokeDasharray={pct === 50 ? '4 3' : undefined}
            />
          ))}

          {compare && compareValues && (
            <polygon
              points={polygonPoints(compareValues)}
              fill="var(--orange)"
              fillOpacity={0.16}
              stroke="var(--orange)"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          )}

          <polygon
            points={polygonPoints(viewerValues)}
            fill="var(--green)"
            fillOpacity={0.28}
            stroke="var(--green)"
            strokeWidth={2}
          />

          {anglesFor().map((angle, i) => {
            const key = DNA_AXES[i].key
            const p = point(angle, (viewerValues[key] / 100) * MAX_R)
            return <circle key={key} cx={p.x} cy={p.y} r={3} fill="var(--green)" />
          })}
        </svg>

        {anglesFor().map((angle, i) => {
          const axis = DNA_AXES[i]
          const p = point(angle, LABEL_R)
          const leftPct = (p.x / 200) * 100
          const topPct = (p.y / 200) * 100
          return (
            <button
              key={axis.key}
              type="button"
              onClick={() => setOpenAxis(cur => (cur === axis.key ? null : axis.key))}
              aria-pressed={openAxis === axis.key}
              aria-label={`${axis.label}, ${axis.name}, valor ${viewer.axes[axis.key].value}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px] font-extrabold rounded-full px-1.5 py-0.5 transition"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                color: openAxis === axis.key ? '#fff' : 'var(--accent)',
                background: openAxis === axis.key ? 'var(--accent)' : 'var(--tint)',
              }}
            >
              {axis.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-4 justify-center mt-2 text-[11px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: 'var(--green)' }} aria-hidden />
          {viewer.playerName}
        </span>
        {compare && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: 'var(--orange)' }} aria-hidden />
            {compare.playerName}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block" style={{ width: 12, height: 0, borderTop: '2px dashed var(--text-muted2)' }} aria-hidden />
          Ref. nivel 2–3
        </span>
      </div>

      <div aria-live="polite">
        {activeAxis && (
          <div
            className="mt-3 rounded-xl px-3 py-2.5 flex items-start justify-between gap-2"
            style={{ background: 'var(--tint)' }}
          >
            <p className="text-xs" style={{ color: 'var(--text)' }}>
              <strong>{activeAxis.label}</strong> · {activeAxis.note}
              {activeInsufficient && (
                <span className="block mt-1" style={{ color: 'var(--text-muted)' }}>
                  {activeAxis.key === 'clu' ? 'Todavía no hay suficientes partidos a tres sets.' : 'Datos todavía insuficientes.'}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setOpenAxis(null)}
              aria-label="Cerrar nota"
              className="shrink-0 text-sm font-bold px-1.5"
              style={{ color: 'var(--text-muted2)' }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
