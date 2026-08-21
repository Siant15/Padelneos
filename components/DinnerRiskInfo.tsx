'use client'

import { useState } from 'react'
import { DINNER_RISK_TIERS } from '@/lib/types'

const DESCRIPTIONS: Record<number, string> = {
  1: 'Muy improbable que acabe pagando con las jornadas que quedan.',
  2: 'Tiene una posibilidad real, pero no es lo más probable.',
  3: 'En bastantes de los resultados posibles termina pagando.',
  4: 'En la mayoría de los resultados posibles, paga.',
}

// La escala se calcula simulando todas las combinaciones de resultados
// de las jornadas que faltan (lib/types.ts::estimateDinnerRisk) — este
// botón solo explica qué significa cada nivel, no repite el cálculo.
export default function DinnerRiskInfo() {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Cómo se calcula el riesgo de pagar la cena"
        aria-expanded={open}
        className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
        style={{ background: 'var(--tint)', color: 'var(--text-muted2)' }}
      >
        i
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-6 z-10 w-64 rounded-xl p-3 text-left normal-case"
          style={{ background: 'var(--surface)', boxShadow: '0 6px 20px rgba(0,0,0,0.14)', border: '1px solid var(--border)' }}
        >
          <p className="text-[11px] font-bold mb-2" style={{ color: 'var(--text-muted2)' }}>
            Probabilidad de acabar 3º o 4º (quien paga la cena), simulando todos los resultados posibles de las jornadas que faltan:
          </p>
          <div className="flex flex-col gap-1.5">
            {DINNER_RISK_TIERS.map(t => (
              <div key={t.level} className="flex items-start gap-2 text-[11px]" style={{ color: 'var(--text)' }}>
                <span aria-hidden>{t.emoji}</span>
                <span><strong>{t.label}</strong> — {DESCRIPTIONS[t.level]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  )
}
