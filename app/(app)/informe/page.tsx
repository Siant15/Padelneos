import Link from 'next/link'
import { getCachedActiveSeason } from '@/lib/supabase/cached'
import { getInformeData } from '@/lib/informe-data'
import type { InformeTitle } from '@/lib/informe'
import InfoToggle from '@/components/InfoToggle'

const GREEN = 'oklch(0.4 0.09 155)'

export default async function InformePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams
  const season = await getCachedActiveSeason()
  const data = season ? await getInformeData(season.id) : null
  // Solo en desarrollo se puede ver el informe antes de la mitad (para revisar el diseño).
  const devPreview = process.env.NODE_ENV !== 'production' && preview === '1'

  return (
    <div className="px-5 pt-5 pb-6">
      <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</Link>

      {!data || (!data.halfReached && !devPreview) ? (
        <div className="mt-4 rounded-2xl p-6 text-center" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <p className="text-3xl">🔒</p>
          <p className="font-heading text-base font-bold mt-2">Informe de mitad de temporada</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {data
              ? `Se abre cuando se juegue la jornada ${Math.ceil(data.roundsTotal / 2)}, la mitad de la liga. Ahora van ${data.roundsPlayed} de ${data.roundsTotal}.`
              : 'No hay una liga activa todavía.'}
          </p>
        </div>
      ) : (
        <Report titles={data.titles} roundsPlayed={data.roundsPlayed} roundsTotal={data.roundsTotal} />
      )}
    </div>
  )
}

function Report({ titles, roundsPlayed, roundsTotal }: { titles: InformeTitle[]; roundsPlayed: number; roundsTotal: number }) {
  const [mvp, error, ...others] = titles

  return (
    <>
      <div className="mt-2">
        <h1 className="font-heading text-[22px] font-extrabold leading-tight">📊 Informe de mitad de temporada</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Después de {roundsPlayed} de {roundsTotal} jornadas</p>
      </div>

      <InfoToggle label="Cómo se calculan los títulos">
        <p>Cuenta lo que ha pasado en los partidos y en las preguntas de apuestas «primero en…». No se cuentan todas las veces durante el partido, solo quién fue <strong style={{ color: 'var(--text)' }}>el primero</strong> en cada jornada.</p>
        {titles.map(t => (
          <p key={t.key}><strong style={{ color: 'var(--text)' }}>{t.emoji} {t.title}:</strong> {t.rule}</p>
        ))}
        <p>Si hay empate arriba, el título se comparte.</p>
      </InfoToggle>

      <div className="flex flex-col gap-3 mt-2">
        <Hero title={mvp} dark />
        <Hero title={error} />

        <p className="font-heading text-sm font-bold mt-1">Otros premios</p>
        <div className="grid grid-cols-2 gap-3">
          {others.map(t => <Tile key={t.key} title={t} />)}
        </div>
      </div>
    </>
  )
}

function winnersLabel(t: InformeTitle): string {
  return t.winners.length > 1 ? t.winners.join(' y ') : t.winners[0]
}

// Tarjeta grande de los dos títulos principales: el ganador a lo grande y, debajo,
// cómo van los demás en una sola línea.
function Hero({ title, dark = false }: { title: InformeTitle; dark?: boolean }) {
  const top = title.rows[0]
  const rest = title.rows.filter(r => !title.winners.includes(r.name))
  return (
    <section
      className="rounded-[22px] p-4"
      style={{
        background: dark ? GREEN : 'oklch(0.95 0.04 55)',
        color: dark ? '#fff' : 'var(--text)',
      }}
    >
      <p className="text-[11px] font-extrabold uppercase tracking-wide opacity-80">{title.title}</p>
      {title.hasData ? (
        <>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-4xl" aria-hidden>{title.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="font-heading font-extrabold text-2xl leading-tight">{winnersLabel(title)}</p>
              {title.winners.length > 1 && <p className="text-xs opacity-80">Empate</p>}
              {top.detail && <p className="text-xs opacity-80 mt-0.5">{top.detail}</p>}
            </div>
            <span
              className="font-heading font-extrabold text-xl rounded-full px-3 py-1 shrink-0"
              style={{ background: dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.07)' }}
            >
              {top.score}
            </span>
          </div>
          {rest.length > 0 && (
            <p className="text-xs mt-3 pt-3 opacity-90" style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}` }}>
              {rest.map(r => `${r.name} ${r.score}`).join(' · ')}
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center gap-3 mt-2">
          <span className="text-4xl opacity-60" aria-hidden>{title.emoji}</span>
          <p className="text-sm opacity-80">Todavía sin datos</p>
        </div>
      )}
    </section>
  )
}

// Mosaico de los premios sencillos: emoji, título, ganador y cuántas veces.
function Tile({ title }: { title: InformeTitle }) {
  const top = title.rows[0]
  return (
    <section className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <p className="text-2xl" aria-hidden>{title.emoji}</p>
      <p className="text-[11px] font-extrabold uppercase tracking-wide mt-1" style={{ color: 'var(--text-muted2)' }}>{title.title}</p>
      {title.hasData ? (
        <>
          <p className="font-heading font-extrabold text-base leading-tight mt-1" style={{ color: 'var(--accent)' }}>{winnersLabel(title)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {top.score} {top.score === 1 ? 'vez' : 'veces'}{title.winners.length > 1 ? ' · empate' : ''}
          </p>
        </>
      ) : (
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted2)' }}>Sin datos</p>
      )}
    </section>
  )
}
