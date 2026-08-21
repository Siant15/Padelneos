'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import JornadasAccordion, { type JornadaViewModel } from '@/components/JornadasAccordion'
import ClasificacionTabs from '@/components/ClasificacionTabs'

type IndividualRow = { medal: string; name: string; pj: number; pg: number; pe: number; pp: number; apuestas: number; total: number }
type PairRow = { name: string; pj: number; pg: number; pe: number; pp: number; pts: number }
type ApuestasRankRow = { medal: string; name: string; wins: number; pts: number }
type BettingTotalRow = { player_id: string; name: string; chips_total: number; total_bonus: number; rounds: number }
type BiggestBetView = { playerName: string; chips: number; optionLabel: string; won: boolean | null }
type ApuestasRoundRow = { id: string; roundNumber: number; statusLabel: string; statusColor: string }

const SECTIONS = [
  { key: 'calendario', label: '📅 Calendario' },
  { key: 'clasificacion', label: '🏆 Clasificación' },
  { key: 'apuestas', label: '💰 Apuestas' },
] as const

type Section = typeof SECTIONS[number]['key']

export default function LigaTabs({
  calendarioItems,
  clasificacionIndividual,
  clasificacionParejas,
  clasificacionApuestas,
  apuestasRanking,
  apuestasNostradamus,
  apuestasBiggestBet,
  apuestasRounds,
  currentUserId,
}: {
  calendarioItems: JornadaViewModel[]
  clasificacionIndividual: IndividualRow[]
  clasificacionParejas: PairRow[]
  clasificacionApuestas: ApuestasRankRow[]
  apuestasRanking: BettingTotalRow[]
  apuestasNostradamus: { name: string; count: number } | null
  apuestasBiggestBet: BiggestBetView | null
  apuestasRounds: ApuestasRoundRow[]
  currentUserId: string
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
        !calendarioItems.length
          ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No hay jornadas creadas todavía.</p>
          : <JornadasAccordion items={calendarioItems} />
      )}

      {section === 'clasificacion' && (
        <>
          <ClasificacionTabs individual={clasificacionIndividual} parejas={clasificacionParejas} apuestas={clasificacionApuestas} />
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
            <h2 className="font-heading text-sm font-bold mb-2.5">Ranking de apostadores</h2>
            <div className="rounded-2xl px-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
              {apuestasRanking.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  Todavía nadie ha hecho fortuna (ni se ha arruinado) apostando
                </div>
              ) : (
                apuestasRanking.map((r, i) => (
                  <div
                    key={r.player_id}
                    className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: i < apuestasRanking.length - 1 ? '1px solid var(--hairline)' : undefined }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold w-5 text-center text-sm" style={{ color: i === 0 ? 'var(--yellow)' : 'var(--text-muted2)' }}>
                        {i + 1}
                      </span>
                      <span className="text-[13px] font-bold">{r.name}</span>
                      {r.player_id === currentUserId && (
                        <span className="text-xs" style={{ color: 'var(--accent)' }}>(tú)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span style={{ color: r.chips_total >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {r.chips_total >= 0 ? '+' : ''}{r.chips_total}🎰
                      </span>
                      <span className="font-bold" style={{ color: 'var(--accent)' }}>+{r.total_bonus}pt</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="font-heading text-sm font-bold mb-2.5">Por jornada</h2>
            {!apuestasRounds.length ? (
              <div className="rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
                Aún no hay jornadas creadas, así que no hay mercados de apuestas todavía.
                <br />
                Ve a <Link href="/admin" className="font-bold" style={{ color: 'var(--accent)' }}>Admin</Link> para crear la liga y la primera jornada.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {apuestasRounds.map(r => (
                  <Link
                    key={r.id}
                    href={`/apuestas/${r.id}`}
                    className="flex items-center justify-between rounded-2xl px-4 py-3 transition hover:opacity-90"
                    style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
                  >
                    <span className="text-[13px] font-bold">Jornada {r.roundNumber}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span style={{ color: r.statusColor }}>{r.statusLabel}</span>
                      <span style={{ color: 'var(--text-muted2)' }}>→</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <div className="rounded-2xl px-3.5 py-3 text-xs" style={{ background: 'var(--surface2)', color: 'oklch(0.35 0.08 155)' }}>
            ⚖️ Menos fichas en el resultado ganador = mayor premio. No puedes apostar en contra de ti mismo.
          </div>
        </div>
      )}
    </div>
  )
}
