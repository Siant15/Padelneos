import { todayMadrid } from '@/lib/rounds'
import { EVENT_BANNER_UNTIL } from '@/lib/ads'

// Banner fijo de Inicio hasta EVENT_BANNER_UNTIL (inclusive).
export default function EventBanner() {
  if (todayMadrid() > EVENT_BANNER_UNTIL) return null
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
