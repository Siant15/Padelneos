'use client'

import { useState } from 'react'

const METRICS = [
  { emoji: '🎯', label: 'Aces', desc: 'Saque directo que el rival no llega ni a tocar.' },
  { emoji: '❌', label: 'Dobles faltas (DF)', desc: 'Fallar los dos saques del mismo punto: se pierde el punto sin más.' },
  { emoji: '🎱', label: 'Bolas por 3 (B×3)', desc: 'Punto ganado metiendo la bola por el hueco de 3 metros del fondo, sin que el rival llegue a tocarla.' },
  { emoji: '💥', label: 'Smash al cristal (SC)', desc: 'Remate que impacta directamente en el cristal del fondo antes de botar, ganando el punto.' },
]

export default function MetricsInfoButton() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Qué significa cada estadística"
        className="w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0"
        style={{ background: 'var(--tint)', color: 'var(--text-muted)' }}
      >
        ⓘ
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-64 rounded-xl p-3.5 z-50 text-left"
            style={{ background: 'var(--surface)', boxShadow: '0 6px 20px rgba(0,0,0,0.15)', border: '1px solid var(--border)' }}
          >
            <p className="text-[11px] font-extrabold mb-2" style={{ color: 'var(--text-muted2)' }}>¿QUÉ ES CADA ESTADÍSTICA?</p>
            <div className="flex flex-col gap-2">
              {METRICS.map(m => (
                <div key={m.label}>
                  <p className="text-xs font-bold">{m.emoji} {m.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
