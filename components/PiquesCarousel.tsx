import Link from 'next/link'
import { Swords, Target, Flame, Snowflake, TrendingUp, Repeat, Dices } from 'lucide-react'
import type { Pique } from '@/lib/piques'

const ICON_BY_TYPE: Record<Pique['type'], typeof Swords> = {
  liderato: Swords,
  podio: Target,
  en_llamas: Flame,
  bajo_presion: Snowflake,
  remontada: TrendingUp,
  cuentas_pendientes: Repeat,
  tapado: Dices,
  rey_pronosticos: Dices,
}

// Fondo suave + acento por historia: verde menta para las de arriba de
// tabla, melocotón para las de abajo/rachas negativas — coherente con
// el resto de la identidad visual (sin degradados ni fotografías).
const STYLE_BY_TYPE: Record<Pique['type'], { bg: string; accent: string }> = {
  liderato: { bg: 'oklch(0.94 0.03 155)', accent: 'var(--green)' },
  podio: { bg: 'oklch(0.95 0.04 55)', accent: 'var(--orange)' },
  en_llamas: { bg: 'oklch(0.94 0.03 155)', accent: 'var(--green)' },
  bajo_presion: { bg: 'oklch(0.95 0.04 55)', accent: 'var(--orange)' },
  remontada: { bg: 'oklch(0.94 0.03 155)', accent: 'var(--green)' },
  cuentas_pendientes: { bg: 'oklch(0.95 0.04 55)', accent: 'var(--orange)' },
  tapado: { bg: 'oklch(0.95 0.04 55)', accent: 'var(--orange)' },
  rey_pronosticos: { bg: 'oklch(0.94 0.03 155)', accent: 'var(--green)' },
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
      <div className="flex items-center justify-center gap-1.5 mt-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className="rounded-full"
            style={{ width: 6, height: 6, background: i === 0 ? 'var(--accent)' : 'var(--tint)' }}
          />
        ))}
      </div>
      <p className="text-[11px] text-center mt-1.5" style={{ color: 'var(--text-muted2)' }}>
        Se actualiza al cerrar cada jornada
      </p>
    </div>
  )
}
