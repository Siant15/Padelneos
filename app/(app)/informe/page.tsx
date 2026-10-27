import Link from 'next/link'
import { getCachedActiveSeason } from '@/lib/supabase/cached'
import { getInformeData } from '@/lib/informe-data'
import InfoToggle from '@/components/InfoToggle'

export default async function InformePage() {
  const season = await getCachedActiveSeason()
  const data = season ? await getInformeData(season.id) : null

  return (
    <div className="px-5 pt-5 pb-6">
      <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</Link>
      <h1 className="font-heading text-[22px] font-extrabold mt-2">📊 Informe de mitad de temporada</h1>

      {!data ? (
        <div className="rounded-2xl p-6 text-center text-sm mt-4" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          No hay una liga activa todavía.
        </div>
      ) : (
        <>
          <p className="text-xs mt-1 font-bold" style={{ color: data.halfReached ? 'var(--green)' : 'var(--orange)' }}>
            {data.halfReached
              ? `Mitad de temporada alcanzada · ${data.roundsPlayed} de ${data.roundsTotal} jornadas jugadas`
              : `Provisional · ${data.roundsPlayed} de ${data.roundsTotal} jornadas jugadas (la mitad llega con ${Math.ceil(data.roundsTotal / 2)})`}
          </p>

          <InfoToggle label="Cómo se calculan los títulos">
            <p>Cada título cuenta lo que ha pasado en los partidos jugados y en las preguntas de apuestas «primero en…» ya resueltas.</p>
            <p>No se cuentan todas las veces que ocurre algo durante el partido, solo quién fue <strong style={{ color: 'var(--text)' }}>el primero</strong> en cada jornada.</p>
            <p>Si hay empate en lo más alto, el título se comparte. Mientras nadie sume, el título queda vacío.</p>
          </InfoToggle>

          <div className="flex flex-col gap-3 mt-2">
            {data.titles.map(t => (
              <section key={t.key} className="rounded-2xl p-4" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
                <p className="font-heading text-sm font-bold">{t.emoji} {t.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.rule}</p>

                <p className="font-heading text-lg font-extrabold mt-3" style={{ color: t.hasData ? 'var(--accent)' : 'var(--text-muted2)' }}>
                  {t.hasData
                    ? `${t.winners.join(' y ')}${t.winners.length > 1 ? ' (empate)' : ''}`
                    : 'Sin datos todavía'}
                </p>

                <div className="mt-2 flex flex-col">
                  {t.rows.map((r, i) => (
                    <div
                      key={r.playerId}
                      className="flex items-baseline justify-between gap-2 py-1.5 text-[13px]"
                      style={{ borderTop: i > 0 ? '1px solid var(--hairline)' : undefined }}
                    >
                      <span className="min-w-0">
                        <strong>{r.name}</strong>
                        {r.detail && <span className="block text-[11px]" style={{ color: 'var(--text-muted2)' }}>{r.detail}</span>}
                      </span>
                      <span className="font-extrabold tabular-nums shrink-0" style={{ color: r.score > 0 ? 'var(--accent)' : 'var(--text-muted2)' }}>{r.score}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
