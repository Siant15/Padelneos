import Link from 'next/link'
import { Flame, TrendingUp, Repeat, Dices, Trophy, AlertTriangle } from 'lucide-react'
import type { Pique } from '@/lib/piques'

const ICON_BY_TYPE: Record<Pique['type'], typeof Flame> = {
  en_llamas: Flame,
  remontada: TrendingUp,
  cuentas_pendientes: Repeat,
  tapado: Dices,
  rey_pronosticos: Trophy,
  bajo_presion: AlertTriangle,
}

// Fondo suave + acento por historia: verde menta para las positivas,
// melocotón para las de presión/riesgo — coherente con el resto de la
// identidad visual (sin degradados ni fotografías).
const STYLE_BY_TYPE: Record<Pique['type'], { bg: string; accent: string }> = {
  en_llamas: { bg: 'oklch(0.94 0.03 155)', accent: 'var(--green)' },
  remontada: { bg: 'oklch(0.94 0.03 155)', accent: 'var(--green)' },
  rey_pronosticos: { bg: 'oklch(0.94 0.03 155)', accent: 'var(--green)' },
  cuentas_pendientes: { bg: 'oklch(0.95 0.04 55)', accent: 'var(--orange)' },
  tapado: { bg: 'oklch(0.95 0.04 55)', accent: 'var(--orange)' },
  bajo_presion: { bg: 'oklch(0.95 0.04 55)', accent: 'var(--orange)' },
}

// Las dos historias más relevantes, siempre las dos visibles a la vez,
// una al lado de la otra — nada de deslizar ni carrusel.
export default function PiquesCarousel({ piques }: { piques: Pique[] }) {
  const shown = piques.slice(0, 2)
  if (!shown.length) return null

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {shown.map(p => {
          const Icon = ICON_BY_TYPE[p.type]
          const style = STYLE_BY_TYPE[p.type]
          return (
            <Link
              key={p.type}
              href="/liga?tab=clasificacion"
              className="rounded-2xl p-3.5 flex flex-col gap-2 transition hover:opacity-90"
              style={{ background: style.bg }}
            >
              <span className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: style.accent }}>
                {p.category}
              </span>
              <Icon size={22} strokeWidth={1.75} style={{ color: style.accent }} />
              <span className="font-heading font-bold text-[14px] leading-tight">{p.title}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.text}</span>
            </Link>
          )
        })}
      </div>
      <p className="text-[11px] text-center mt-2.5" style={{ color: 'var(--text-muted2)' }}>
        Se actualiza al cerrar cada jornada
      </p>
    </div>
  )
}
