import Link from 'next/link'
import { Flame, TrendingUp, Repeat, Dices, Trophy, AlertTriangle } from 'lucide-react'
import { getCachedActiveSeason } from '@/lib/supabase/cached'
import { getInicioData } from '@/lib/inicio-data'
import type { Pique } from '@/lib/piques'

const ICON_BY_TYPE: Record<Pique['type'], typeof Flame> = {
  en_llamas: Flame,
  remontada: TrendingUp,
  cuentas_pendientes: Repeat,
  tapado: Dices,
  rey_pronosticos: Trophy,
  bajo_presion: AlertTriangle,
}

export default async function PiquesPage() {
  const season = await getCachedActiveSeason()

  const { piques } = season ? await getInicioData(season.id) : { piques: [] as Pique[] }

  return (
    <div className="px-5 pt-5 pb-6">
      <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</Link>
      <h1 className="font-heading text-[22px] font-extrabold mt-2 mb-4">Todos los piques</h1>

      {!piques.length && (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          Todavía no hay suficientes partidos jugados para calcular historias de la jornada.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {piques.map(p => {
          const Icon = ICON_BY_TYPE[p.type]
          return (
            <div
              key={p.type}
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
            >
              <span
                className="flex items-center justify-center rounded-full shrink-0"
                style={{ width: 40, height: 40, background: 'var(--surface2)', color: 'var(--accent)' }}
              >
                <Icon size={19} strokeWidth={2} />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-muted2)' }}>{p.category}</p>
                <p className="font-heading font-bold text-sm mt-0.5">{p.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
