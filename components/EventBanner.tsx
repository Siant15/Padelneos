import { todayMadrid } from '@/lib/rounds'
import { EVENT_BANNER_UNTIL, PROFEI_TAGLINE } from '@/lib/ads'

// Arriba de Inicio: hasta EVENT_BANNER_UNTIL (inclusive) el banner de la feria;
// después, el banner fijo de Profei (logo + frase).
export default function EventBanner() {
  if (todayMadrid() > EVENT_BANNER_UNTIL) return <ProfeiBanner />

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted2)' }}>Publicidad</p>
      <a href="https://creativabarcelona.com/" target="_blank" rel="noopener noreferrer" className="block rounded-2xl overflow-hidden" style={{ boxShadow: '0 3px 10px rgba(0,0,0,0.06)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ads/creativa-banner.jpg"
          alt="Creativa Barcelona, Salón de las Manualidades y Artesanías. 5 al 8 de noviembre de 2026, La Farga de L’Hospitalet. Tu entrada por solo 3 euros. ¡Ven a visitar nuestro stand!"
          className="block w-full h-auto"
          width={600}
          height={100}
        />
      </a>
    </div>
  )
}

// El logo de Profei es blanco: va sobre un fondo oscuro.
function ProfeiBanner() {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted2)' }}>Publicidad</p>
      <a
        href="https://profei.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 rounded-2xl px-4 py-3 min-h-[68px] transition hover:opacity-90"
        style={{ background: 'oklch(0.3 0.04 250)', boxShadow: '0 3px 10px rgba(0,0,0,0.08)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ads/profei-logo.png" alt="Profei, Promoción de Ferias Internacionales" width={120} height={31} className="block h-auto shrink-0" style={{ width: 120 }} />
        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{PROFEI_TAGLINE}</span>
      </a>
    </div>
  )
}
