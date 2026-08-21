'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { type JornadaViewModel } from '@/components/JornadasAccordion'
import ClasificacionTabs from '@/components/ClasificacionTabs'
import CalendarioTab from '@/components/CalendarioTab'

type PlayerLite = { id: string; name: string }
type ActiveSeasonInfo = { id: string; name: string; minMatches: number }

type IndividualRow = { medal: string; name: string; pj: number; pg: number; pe: number; pp: number; apuestas: number; total: number }
type PairRow = { name: string; pj: number; pg: number; pe: number; pp: number; pts: number }
type ApuestasMatrixRow = { name: string; cells: (number | null)[]; total: number }
type BiggestBetView = { playerName: string; chips: number; optionLabel: string; won: boolean | null }
type ApuestasRoundRow = { id: string; roundNumber: number; statusLabel: string; statusColor: string }
type ApuestasHistoricalSeason = { seasonId: string; seasonName: string; rounds: ApuestasRoundRow[] }

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
  apuestasNostradamus,
  apuestasBiggestBet,
  apuestasRounds,
  apuestasHistoricalSeasons,
}: {
  activeSeason: ActiveSeasonInfo | null
  players: PlayerLite[]
  calendarioItems: JornadaViewModel[]
  isLeagueComplete: boolean
  clasificacionIndividual: IndividualRow[]
  clasificacionParejas: PairRow[]
  clasificacionApuestasMatrix: ApuestasMatrixRow[]
  clasificacionApuestasRoundLabels: string[]
  apuestasNostradamus: { name: string; count: number } | null
  apuestasBiggestBet: BiggestBetView | null
  apuestasRounds: ApuestasRoundRow[]
  apuestasHistoricalSeasons: ApuestasHistoricalSeason[]
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
        <div className="flex flex-col gap-3.5">
          {apuestasNostradamus && (
            <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface2)' }}>
              <p className="text-xs font-bold mb-1" style={{ color: 'var(--accent)' }}>🔮 Nostradamus de la liga</p>
              <p className="text-xs">
                <strong>{apuestasNostradamus.name}</strong> lleva {apuestasNostradamus.count} jornadas seguidas acertando más que nadie
              </p>
            </div>
          )}

          {apuestasBiggestBet && (
            <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--yellow)', color: 'var(--yellow-text)' }}>
              <p className="text-xs font-bold mb-1">🎲 La apuesta más loca de la historia</p>
              <p className="text-xs">
                <strong>{apuestasBiggestBet.playerName}</strong> se jugó {apuestasBiggestBet.chips} fichas a &quot;{apuestasBiggestBet.optionLabel}&quot;
                {apuestasBiggestBet.won === true && ' · y acertó 🏆'}
                {apuestasBiggestBet.won === false && ' · y falló 💀'}
              </p>
            </div>
          )}

          <section>
            <h2 className="font-heading text-sm font-bold mb-2.5">Por jornada</h2>
            {!apuestasRounds.length ? (
              <div className="rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
                Aún no hay jornadas creadas, así que no hay apuestas todavía.
                <br />
                Ve a la pestaña <Link href="/liga?tab=calendario" className="font-bold" style={{ color: 'var(--accent)' }}>Calendario</Link> para crear la liga.
              </div>
            ) : (
              <RoundJumper rounds={apuestasRounds} />
            )}
          </section>

          {apuestasHistoricalSeasons.length > 0 && (
            <HistoricalApuestas seasons={apuestasHistoricalSeasons} />
          )}

          <div className="rounded-2xl px-3.5 py-3 text-xs" style={{ background: 'var(--surface2)', color: 'oklch(0.35 0.08 155)' }}>
            ⚖️ Menos fichas en el resultado ganador = mayor premio. No puedes apostar en contra de ti mismo.
          </div>
        </div>
      )}
    </div>
  )
}

// Navegador rápido de jornadas: desplegable (salta directo) + botones
// anterior/siguiente, en vez de una fila de chips que hay que arrastrar
// una a una.
function RoundJumper({ rounds }: { rounds: ApuestasRoundRow[] }) {
  const router = useRouter()
  const sorted = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber)
  const [selectedId, setSelectedId] = useState(sorted[0]?.id ?? '')
  const index = sorted.findIndex(r => r.id === selectedId)
  const current = index === -1 ? sorted[0] : sorted[index]

  function go(id: string) {
    setSelectedId(id)
    router.push(`/apuestas/${id}`)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => index > 0 && go(sorted[index - 1].id)}
        disabled={index <= 0}
        className="w-9 h-9 shrink-0 rounded-xl font-bold disabled:opacity-30"
        style={{ background: 'var(--tint)', color: '#555' }}
        aria-label="Jornada anterior"
      >
        ‹
      </button>
      <select
        value={current?.id ?? ''}
        onChange={e => go(e.target.value)}
        className="flex-1 text-sm font-bold rounded-xl px-3 py-2.5 outline-none"
        style={{ background: 'var(--surface)', border: `1px solid ${current?.statusColor ?? 'var(--border)'}`, color: current?.statusColor ?? 'var(--text)' }}
      >
        {sorted.map(r => (
          <option key={r.id} value={r.id}>J{r.roundNumber} · {r.statusLabel}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => index < sorted.length - 1 && go(sorted[index + 1].id)}
        disabled={index === -1 || index >= sorted.length - 1}
        className="w-9 h-9 shrink-0 rounded-xl font-bold disabled:opacity-30"
        style={{ background: 'var(--tint)', color: '#555' }}
        aria-label="Jornada siguiente"
      >
        ›
      </button>
    </div>
  )
}

// Apuestas de temporadas ya cerradas: se guardan siempre, para poder
// seguir consultando sus jornadas y mercados aunque ya no sean la
// temporada activa.
function HistoricalApuestas({ seasons }: { seasons: ApuestasHistoricalSeason[] }) {
  const [open, setOpen] = useState(false)

  return (
    <section>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full"
      >
        <h2 className="font-heading text-sm font-bold">📜 Histórico</h2>
        <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{open ? '▲ ocultar' : '▼ ver'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 mt-2.5">
          {seasons.map(s => (
            <div key={s.seasonId}>
              <p className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>{s.seasonName}</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {s.rounds
                  .slice()
                  .sort((a, b) => a.roundNumber - b.roundNumber)
                  .map(r => (
                    <Link
                      key={r.id}
                      href={`/apuestas/${r.id}`}
                      className="shrink-0 rounded-xl px-3.5 py-2 font-bold text-[13px] transition hover:opacity-90"
                      style={{ background: 'var(--surface)', border: `1px solid ${r.statusColor}`, color: r.statusColor }}
                    >
                      J{r.roundNumber}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
