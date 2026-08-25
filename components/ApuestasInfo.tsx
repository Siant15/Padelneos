'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'

// Explica de dónde salen las fichas, los premios y los puntos de la
// jornada — sin repetir cálculos en ningún otro sitio, solo texto.
export default function ApuestasInfo() {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Cómo funcionan las apuestas"
        aria-expanded={open}
        className="flex items-center justify-center shrink-0"
        style={{ color: 'var(--text-muted2)' }}
      >
        <Info size={15} strokeWidth={2.2} />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-6 z-10 w-72 rounded-xl p-3 text-left"
          style={{ background: 'var(--surface)', boxShadow: '0 6px 20px rgba(0,0,0,0.14)', border: '1px solid var(--border)' }}
        >
          <p className="text-[11px] font-bold mb-2" style={{ color: 'var(--text-muted2)' }}>
            Cómo funcionan las apuestas
          </p>
          <div className="flex flex-col gap-2 text-[11px]" style={{ color: 'var(--text)' }}>
            <p><strong>100 fichas por jugador y jornada.</strong> Repártelas entre las preguntas que quieras, sin poder apostar en contra de ti mismo.</p>
            <p><strong>El premio depende de cuánta gente acierta.</strong> El bote de cada pregunta (todas las fichas apostadas a ella) se reparte solo entre quienes acertaron, proporcionalmente a lo que apostó cada uno — cuantas menos fichas haya en la opción ganadora, mayor premio por ficha.</p>
            <p><strong>Si nadie acierta una pregunta,</strong> su bote no se pierde: pasa a la siguiente vez que se haga esa misma pregunta (jackpot acumulado).</p>
            <p><strong>Los premios no se ven hasta que la jornada se liquida</strong> (cuando se resuelven todas sus preguntas).</p>
            <p><strong>Puntos de la jornada:</strong> quien más fichas termina llevándose es 1º (+1 punto) y el 2º se lleva +0,5 — el 3º y 4º no ganan puntos. Si el 1º y el 2º empatan entre sí, se reparten esos puntos a partes iguales.</p>
          </div>
        </div>
      )}
    </span>
  )
}
