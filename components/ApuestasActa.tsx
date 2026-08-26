import type { ActaMarket, ActaClosureRow } from '@/lib/betting-queries'

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈' }

// Vista de solo lectura de una jornada ya liquidada: un acta/recibo de
// apuestas, no un dashboard — una sola columna, lectura continua, sin
// tarjetas por pregunta ni gráficos. El resultado propio del jugador
// autenticado siempre se destaca primero, antes que la tabla del grupo.
export default function ApuestasActa({ markets, closure, pair1Label, pair2Label, scoreLabel, userId }: {
  markets: ActaMarket[]
  closure: ActaClosureRow[]
  pair1Label: string | null
  pair2Label: string | null
  scoreLabel: string | null
  userId: string
}) {
  const me = closure.find(c => c.playerId === userId)

  return (
    <div className="rounded-2xl" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      {(pair1Label || pair2Label) && (
        <div className="px-4 pt-4 pb-3.5" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--green-bg)', borderRadius: '16px 16px 0 0' }}>
          <p className="text-[10.5px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Resultado final</p>
          <div className="flex items-center justify-between gap-2 mt-2">
            <span className="text-sm font-bold flex-1 min-w-0 truncate">{pair1Label}</span>
            {scoreLabel && (
              <span
                className="shrink-0 px-3 py-1.5 rounded-full font-heading font-extrabold text-base"
                style={{ background: 'var(--green)', color: '#fff' }}
              >
                {scoreLabel}
              </span>
            )}
            <span className="text-sm font-bold flex-1 min-w-0 truncate text-right">{pair2Label}</span>
          </div>
          {me && (
            <p className="text-xs mt-2.5" style={{ color: 'var(--text)' }}>
              Tu jornada, {me.playerName} · {me.correctCount} acierto{me.correctCount === 1 ? '' : 's'} · {me.chipsReceived} fichas recibidas
            </p>
          )}
        </div>
      )}

      <h2 className="font-heading font-bold text-sm px-4 pt-4 pb-1">Resultados y apuestas del grupo</h2>

      {!markets.length && (
        <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
          Esta jornada no tuvo preguntas de apuestas.
        </p>
      )}

      {markets.map((market, i) => {
        const noBets = !market.voided && !market.rows.length

        // Preguntas sin ninguna apuesta: una fila compacta, no un bloque.
        if (noBets) {
          return (
            <div
              key={market.id}
              className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs"
              style={{ borderTop: i > 0 ? '1px solid var(--hairline)' : undefined, color: 'var(--text-muted)' }}
            >
              <span className="min-w-0 truncate">{market.description}</span>
              <span className="shrink-0">Sin apuestas</span>
            </div>
          )
        }

        const myRow = market.rows.find(r => r.playerId === userId)
        const pot = market.rows.reduce((s, r) => s + (r.chips ?? 0), 0)

        return (
          <section
            key={market.id}
            className="px-4 py-3.5"
            style={{ borderTop: i > 0 ? '1px solid var(--hairline)' : undefined }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[13px] font-bold flex-1 min-w-0">{market.description}</p>
              {market.voided ? (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: 'var(--tint)', color: 'var(--text-muted)' }}>
                  Anulada
                </span>
              ) : market.winningLabel ? (
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1"
                  style={{ background: 'var(--green-bg)', color: 'var(--green)' }}
                >
                  <span aria-hidden>✓</span> {market.winningLabel}
                </span>
              ) : market.resolved ? (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: 'var(--tint)', color: 'var(--text-muted)' }}>
                  Sin acertantes
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: 'var(--tint)', color: 'var(--text-muted)' }}>
                  Pendiente de resolver
                </span>
              )}
            </div>

            {market.voided ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pregunta anulada · fichas devueltas</p>
            ) : (
              <>
                <PersonalResultLine row={myRow} />

                <p className="text-[10px] font-bold uppercase tracking-wide mt-3 mb-1.5" style={{ color: 'var(--text-muted2)' }}>
                  Apuestas del grupo
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th scope="col" className="text-left font-bold pb-1" style={{ color: 'var(--text-muted2)' }}>Jugador</th>
                        {market.showPronostico && (
                          <th scope="col" className="text-left font-bold pb-1" style={{ color: 'var(--text-muted2)' }}>Pronóstico</th>
                        )}
                        <th scope="col" className="text-right font-bold pb-1" style={{ color: 'var(--text-muted2)' }}>Apostó</th>
                        <th scope="col" className="text-right font-bold pb-1" style={{ color: 'var(--text-muted2)' }}>Premio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {market.rows.map(row => (
                        <tr
                          key={row.playerId}
                          style={row.playerId === userId ? { background: 'var(--tint)' } : undefined}
                        >
                          <td className="py-1.5 pr-2 font-bold whitespace-nowrap">
                            {row.isWinner && <span style={{ color: 'var(--green)' }} aria-label="Acertó">✓ </span>}
                            {row.playerName}
                            {row.playerId === userId && <span style={{ color: 'var(--text-muted2)', fontWeight: 400 }}> · tú</span>}
                          </td>
                          {market.showPronostico && <td className="py-1.5 pr-2">{row.pronostico}</td>}
                          <td className="py-1.5 pr-2 text-right tabular-nums">{row.chips}</td>
                          <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: row.prize ? 'var(--green)' : 'var(--text-muted2)' }}>
                            {row.prize ? row.prize.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {market.hasNoWinners && (
                  <p
                    className="text-[11px] font-bold mt-2.5 inline-flex px-2.5 py-1 rounded-full"
                    style={{ background: 'var(--orange-bg)', color: 'var(--orange)' }}
                  >
                    🎰 Sin acertantes · bote +{pot}
                  </p>
                )}
              </>
            )}
          </section>
        )
      })}

      {closure.length > 0 && (
        <div className="px-4 py-3.5" style={{ borderTop: '1px solid var(--hairline)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted2)' }}>
            Cierre de la jornada
          </p>
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" className="text-left font-bold pb-1.5" style={{ color: 'var(--text-muted2)' }}>Jugador</th>
                <th scope="col" className="text-right font-bold pb-1.5" style={{ color: 'var(--text-muted2)' }}>
                  Fichas<br />apostadas
                </th>
                <th scope="col" className="text-right font-bold pb-1.5" style={{ color: 'var(--text-muted2)' }}>
                  Fichas<br />recibidas
                </th>
                <th scope="col" className="text-right font-bold pb-1.5" style={{ color: 'var(--text-muted2)' }}>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {closure.map(row => (
                <tr key={row.playerId} style={row.playerId === userId ? { background: 'var(--tint)' } : undefined}>
                  <td className="py-1.5 pr-2 font-bold whitespace-nowrap">
                    {MEDALS[row.rank] ? `${MEDALS[row.rank]} ` : ''}{row.playerName}
                    {row.playerId === userId && <span style={{ color: 'var(--text-muted2)', fontWeight: 400 }}> · Tú</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{row.chipsBet}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{row.chipsReceived}</td>
                  <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: row.points > 0 ? 'var(--green)' : 'var(--text-muted2)' }}>
                    {row.points > 0 ? `+${row.points.toLocaleString('es-ES', { maximumFractionDigits: 2 })}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PersonalResultLine({ row }: { row: { pronostico: string | null; chips: number | null; prize: number | null; isWinner: boolean } | undefined }) {
  if (!row || row.chips === null) {
    return <p className="text-xs" style={{ color: 'var(--text-muted2)' }}>No apostaste en esta pregunta</p>
  }
  if (row.isWinner && row.prize) {
    return (
      <p className="text-xs font-semibold" style={{ color: 'var(--green)' }}>
        ✓ Acertaste · apostaste {row.chips} · recibes {row.prize.toLocaleString('es-ES', { maximumFractionDigits: 2 })} fichas
      </p>
    )
  }
  return (
    <p className="text-xs font-semibold" style={{ color: 'var(--red)' }}>
      ✕ Apostaste por {row.pronostico} · −{row.chips} fichas
    </p>
  )
}
