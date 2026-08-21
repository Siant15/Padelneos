'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { type JornadaViewModel } from '@/components/JornadasAccordion'
import ClasificacionTabs from '@/components/ClasificacionTabs'
import CalendarioTab from '@/components/CalendarioTab'
import ApuestasTab, { type ApuestasRoundEntry } from '@/components/ApuestasTab'

type PlayerLite = { id: string; name: string }
type ActiveSeasonInfo = { id: string; name: string; minMatches: number }

type IndividualRow = { medal: string; name: string; pj: number; pg: number; pe: number; pp: number; apuestas: number; total: number }
type PairRow = { name: string; pj: number; pg: number; pe: number; pp: number; pts: number }
type ApuestasMatrixRow = { name: string; cells: (number | null)[]; total: number }

const SECTIONS = [
  { key: 'calendario', label: '📅 Calendario' },
  { key: 'clasificacion', label: '🏆 Clasificación' },
  { key: 'apuestas', label: '💰 Apuestas' },
] as const

type Section = typeof SECTIONS[number]['key']

export default function LigaTabs({
  activeSeason,
  players,
  calendarioItems,
  isLeagueComplete,
  clasificacionIndividual,
  clasificacionParejas,
  clasificacionApuestasMatrix,
  clasificacionApuestasRoundLabels,
  userId,
  apuestasRounds,
}: {
  activeSeason: ActiveSeasonInfo | null
  players: PlayerLite[]
  calendarioItems: JornadaViewModel[]
  isLeagueComplete: boolean
  clasificacionIndividual: IndividualRow[]
  clasificacionParejas: PairRow[]
  clasificacionApuestasMatrix: ApuestasMatrixRow[]
  clasificacionApuestasRoundLabels: string[]
  userId: string
  apuestasRounds: ApuestasRoundEntry[]
}) {
  const searchParams = useSearchParams()
  const initial = searchParams.get('tab') as Section | null
  const [section, setSection] = useState<Section>(initial && SECTIONS.some(s => s.key === initial) ? initial : 'calendario')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-[14px] p-1" style={{ background: 'var(--tint)' }}>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className="flex-1 rounded-[11px] py-2 font-heading font-bold text-xs transition"
            style={{
              background: section === s.key ? '#fff' : 'transparent',
              color: section === s.key ? 'var(--accent)' : 'var(--text-muted2)',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'calendario' && (
        <CalendarioTab
          activeSeason={activeSeason}
          players={players}
          items={calendarioItems}
          isLeagueComplete={isLeagueComplete}
        />
      )}

      {section === 'clasificacion' && (
        <>
          <ClasificacionTabs
            individual={clasificacionIndividual}
            parejas={clasificacionParejas}
            apuestasMatrix={clasificacionApuestasMatrix}
            apuestasRoundLabels={clasificacionApuestasRoundLabels}
          />
          <Link
            href="/estadisticas"
            className="flex items-center justify-between rounded-2xl px-4 py-3.5 transition hover:opacity-90"
            style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
          >
            <div>
              <p className="font-heading font-bold text-sm">📊 Estadísticas de juego</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Aces, dobles faltas, bolas por 3 y récords</p>
            </div>
            <span style={{ color: 'var(--text-muted2)' }}>→</span>
          </Link>
        </>
      )}

      {section === 'apuestas' && (
        !apuestasRounds.length ? (
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            Aún no hay jornadas creadas, así que no hay apuestas todavía.
            <br />
            Ve a la pestaña <Link href="/liga?tab=calendario" className="font-bold" style={{ color: 'var(--accent)' }}>Calendario</Link> para crear la liga.
          </div>
        ) : (
          <ApuestasTab userId={userId} rounds={apuestasRounds} />
        )
      )}
    </div>
  )
}
