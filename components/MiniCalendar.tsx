'use client'

import { useState } from 'react'

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

type Cell = { key: number; label: number; muted: boolean; match: boolean }

function buildMonthGrid(year: number, month: number, matchDays: Set<number>): Cell[] {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  const cells: Omit<Cell, 'key'>[] = []
  for (let i = 0; i < startOffset; i++) {
    cells.push({ label: daysInPrev - startOffset + 1 + i, muted: true, match: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ label: d, muted: false, match: matchDays.has(d) })
  }
  let nextDay = 1
  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({ label: nextDay++, muted: true, match: false })
  }
  return cells.map((c, i) => ({ ...c, key: i }))
}

export default function MiniCalendar({ matchDates }: { matchDates: string[] }) {
  const today = new Date()
  const [monthOffset, setMonthOffset] = useState(0)

  const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const year = base.getFullYear()
  const month = base.getMonth()

  const matchDays = new Set(
    matchDates
      .map(d => new Date(d + 'T12:00:00'))
      .filter(d => d.getFullYear() === year && d.getMonth() === month)
      .map(d => d.getDate())
  )

  const cells = buildMonthGrid(year, month, matchDays)
  const monthLabel = base.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  return (
    <div className="rounded-2xl px-4 py-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2.5">
        <button onClick={() => setMonthOffset(o => o - 1)} className="text-base px-1" style={{ color: 'var(--text-muted)' }} aria-label="Mes anterior">‹</button>
        <span className="font-heading font-bold text-sm capitalize">{monthLabel}</span>
        <button onClick={() => setMonthOffset(o => o + 1)} className="text-base px-1" style={{ color: 'var(--text-muted)' }} aria-label="Mes siguiente">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS.map(l => (
          <span key={l} className="text-[11px] font-bold py-1" style={{ color: 'var(--text-muted2)' }}>{l}</span>
        ))}
        {cells.map(c => (
          <span
            key={c.key}
            className="text-[12.5px] py-1.5 rounded-lg"
            style={
              c.match
                ? { background: 'var(--accent)', color: '#fff', fontWeight: 800 }
                : c.muted
                  ? { color: 'var(--text-muted2)', opacity: 0.5 }
                  : { color: 'var(--text)', fontWeight: 600 }
            }
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}
