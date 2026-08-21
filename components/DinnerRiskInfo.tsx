'use client'

import { useState } from 'react'
import { DINNER_RISK_TIERS } from '@/lib/types'

const DESCRIPTIONS: Record<number, string> = {
  1: 'Muy improbable que acabe pagando con las jornadas que quedan.',
  2: 'Poco probable, pero no descartable del todo.',
  3: 'Tiene una posibilidad real, aunque no es lo más probable.',
  4: 'En una parte considerable de los resultados posibles, paga.',
  5: 'En la mayoría de los resultados posibles, paga.',
  6: 'En casi todos los resultados posibles, paga.',
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
          <p className="text-[11px] mb-2" style={{ color: 'var(--text)' }}>
            <strong>Cómo se calcula:</strong> se parte de los puntos que ya tiene cada jugador con los partidos ya jugados (si Edu ya le ganó a Santi, eso ya cuenta) y se simulan todas las combinaciones posibles de resultados de las jornadas que quedan (cada una solo puede caer para una de las dos parejas ya fijadas en el calendario — una revancha en la vuelta no anula nada, simplemente suma sus propios puntos). En cada combinación se mira quién acaba 3º o 4º de la tabla, y el % de combinaciones en las que le toca a cada jugador es lo que fija su nivel.
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
