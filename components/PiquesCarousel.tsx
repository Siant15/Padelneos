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

// Fondo suave por historia: verde menta para las de arriba de tabla,
// melocotón para las de abajo/rachas negativas — coherente con el resto
// de la identidad visual (sin degradados ni fotografías).
const BG_BY_TYPE: Record<Pique['type'], string> = {
  liderato: 'oklch(0.94 0.03 155)',
  podio: 'oklch(0.95 0.04 55)',
  en_llamas: 'oklch(0.94 0.03 155)',
  bajo_presion: 'oklch(0.95 0.04 55)',
  remontada: 'oklch(0.94 0.03 155)',
  cuentas_pendientes: 'oklch(0.95 0.04 55)',
  tapado: 'oklch(0.95 0.04 55)',
  rey_pronosticos: 'oklch(0.94 0.03 155)',
}

// Las dos historias más relevantes, ambas visibles de una vez — sin
// deslizar ni carrusel.
export default function PiquesCarousel({ piques }: { piques: Pique[] }) {
  const shown = piques.slice(0, 2)
  if (!shown.length) return null

  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {shown.map(p => {
          const Icon = ICON_BY_TYPE[p.type]
          return (
            <Link
              key={p.type}
              href="/liga?tab=clasificacion"
              className="rounded-2xl p-4 flex items-center gap-3 transition hover:opacity-90"
              style={{ background: BG_BY_TYPE[p.type] }}
            >
              <span
                className="flex items-center justify-center rounded-full shrink-0"
                style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.6)', color: 'var(--accent)' }}
              >
                <Icon size={18} strokeWidth={2} />
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wide block" style={{ color: 'var(--text-muted2)' }}>
                  {p.category}
                </span>
                <span className="font-heading font-bold text-[14px] leading-tight block">{p.title}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.text}</span>
              </div>
            </Link>
          )
        })}
      </div>
      <p className="text-[11px] text-center mt-2" style={{ color: 'var(--text-muted2)' }}>
        Se actualiza al cerrar cada jornada
      </p>
    </div>
  )
}
