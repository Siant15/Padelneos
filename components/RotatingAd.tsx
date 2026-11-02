'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { Ad } from '@/lib/ads'

// Solo en las pantallas principales: no estorba en los formularios de gestión.
const SHOW_ON = ['/dashboard', '/liga', '/perfil', '/piques', '/informe']
const ROTATE_MS = 8000

// Anuncio rotativo (eventos de Profei), con la etiqueta «Publicidad». Rota
// solo cada pocos segundos, se detiene al pasar el ratón o enfocar, y no
// rota si el usuario tiene activada la opción de reducir animaciones.
export default function RotatingAd({ ads }: { ads: Ad[] }) {
  const pathname = usePathname()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (ads.length < 2 || paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex(i => (i + 1) % ads.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [ads.length, paused])

  if (!ads.length || !SHOW_ON.some(p => pathname === p || pathname.startsWith(p + '/'))) return null
  const ad = ads[index % ads.length]

  return (
    <aside
      className="mx-5 mt-2 mb-4"
      aria-label="Publicidad"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted2)' }}>Publicidad</p>
      <a
        key={ad.id}
        href={ad.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-stretch rounded-2xl overflow-hidden min-h-[68px] transition hover:opacity-90"
        style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.05)', border: '1px solid var(--hairline)' }}
      >
        {/* El logo de Profei es blanco: va sobre un fondo oscuro. */}
        <span className="flex items-center justify-center shrink-0 px-3" style={{ width: 104, background: 'oklch(0.3 0.04 250)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ads/profei-logo.png" alt="Profei" width={80} height={21} className="block w-full h-auto" />
        </span>
        <span className="min-w-0 px-4 py-3">
          <span className="block font-heading font-bold text-sm">{ad.title} <span aria-hidden style={{ color: 'var(--accent)' }}>↗</span></span>
          <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{ad.subtitle}</span>
        </span>
      </a>
      {ads.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2" role="group" aria-label="Elegir anuncio">
          {ads.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ver anuncio: ${a.title}`}
              aria-current={i === index % ads.length}
              className="w-6 h-6 flex items-center justify-center"
            >
              <span className="block rounded-full" style={{ width: 7, height: 7, background: i === index % ads.length ? 'var(--accent)' : 'var(--border)' }} />
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
