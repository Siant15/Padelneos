import type { ActaMarket, ActaStandingsLine } from '@/lib/betting-queries'

// Vista de solo lectura de una jornada ya liquidada: un acta/recibo de
// apuestas, no un dashboard — una sola columna, lectura continua, sin
// tarjetas por pregunta ni gráficos.
export default function ApuestasActa({ markets, standings }: { markets: ActaMarket[]; standings: ActaStandingsLine }) {
  return (
    <div className="rounded-2xl" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <h2 className="font-heading font-bold text-sm px-4 pt-4 pb-1">Apuestas de la jornada</h2>

      {!markets.length && (
        <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
          Esta jornada no tuvo preguntas de apuestas.
        </p>
      )}

      {markets.map((market, i) => (
        <section
          key={market.id}
          className="px-4 py-3.5"
          style={{ borderTop: i > 0 ? '1px solid var(--hairline)' : undefined }}
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <p className="text-[13px] font-bold flex-1">{market.description}</p>
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
          ) : !market.rows.length ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nadie apostó en esta pregunta</p>
          ) : (
            <>
              {/* Escritorio/tablet: tabla real. En móvil se sustituye por
                  filas apiladas (abajo) para no depender de scroll
                  horizontal ni recortar contenido. */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th scope="col" className="text-left font-bold py-1 pr-2" style={{ color: 'var(--text-muted2)' }}>Jugador</th>
                      {market.showPronostico && (
                        <th scope="col" className="text-left font-bold py-1 pr-2" style={{ color: 'var(--text-muted2)' }}>Pronóstico</th>
                      )}
                      <th scope="col" className="text-right font-bold py-1 pr-2" style={{ color: 'var(--text-muted2)' }}>Apostó</th>
                      <th scope="col" className="text-right font-bold py-1" style={{ color: 'var(--text-muted2)' }}>Premio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.rows.map(row => (
                      <tr key={row.playerId} style={row.isWinner ? { background: 'var(--green-bg)' } : undefined}>
                        <td className="py-1.5 pr-2 font-bold rounded-l-lg">
                          {row.playerName}
                          {row.isWinner && <span className="ml-1" style={{ color: 'var(--green)' }} aria-label="Ganador">✓</span>}
                        </td>
                        {market.showPronostico && <td className="py-1.5 pr-2">{row.pronostico}</td>}
                        <td className="py-1.5 pr-2 text-right whitespace-nowrap">{row.chips} fichas</td>
                        <td className="py-1.5 text-right font-bold rounded-r-lg" style={{ color: row.prize ? 'var(--green)' : undefined }}>
                          {row.prize ? row.prize.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-1.5 sm:hidden" role="table" aria-label={`Apuestas de ${market.description}`}>
                {market.rows.map(row => (
                  <div
                    key={row.playerId}
                    role="row"
                    className="rounded-xl px-2.5 py-2 text-xs"
                    style={{ background: row.isWinner ? 'var(--green-bg)' : 'var(--tint)' }}
                  >
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span>
                        {row.playerName}
                        {row.isWinner && <span className="ml-1" style={{ color: 'var(--green)' }} aria-label="Ganador">✓</span>}
                      </span>
                      <span style={{ color: row.prize ? 'var(--green)' : 'var(--text-muted2)' }}>
                        {row.prize ? row.prize.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {market.showPronostico && <span>Pronóstico: {row.pronostico}</span>}
                      <span>Apostó: {row.chips} fichas</span>
                    </div>
                  </div>
                ))}
              </div>
              {market.hasNoWinners && (
                <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                  Sin acertantes · bote acumulado para la siguiente jornada
                </p>
              )}
            </>
          )}
        </section>
      ))}

      {standings.length > 0 && (
        <p className="px-4 py-3 text-[11px]" style={{ borderTop: '1px solid var(--hairline)', color: 'var(--text-muted)' }}>
          Ganadores de la jornada: {standingsLabel(standings)}
        </p>
      )}
    </div>
  )
}

// Agrupa por puntos idénticos: si el 1º y el 2º puesto empatan entre
// sí (mismos puntos), se muestran los dos bajo el mismo puesto y el
// reparto correspondiente, en vez de forzar dos líneas distintas.
function standingsLabel(standings: ActaStandingsLine): string {
  const groups: { rank: number; names: string[]; pointBonus: number }[] = []
  for (const s of [...standings].sort((a, b) => a.rank - b.rank)) {
    const last = groups[groups.length - 1]
    if (last && last.pointBonus === s.pointBonus) {
      last.names.push(s.name)
    } else {
      groups.push({ rank: s.rank, names: [s.name], pointBonus: s.pointBonus })
    }
  }
  const fmtPts = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  return groups
    .map(g => `${g.rank}.º ${g.names.join(' y ')} · +${fmtPts(g.pointBonus)} pt${g.names.length > 1 ? ' cada uno' : ''}`)
    .join(' · ')
}
