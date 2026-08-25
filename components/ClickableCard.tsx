'use client'

import { useRouter } from 'next/navigation'
import type { CSSProperties, ReactNode, KeyboardEvent } from 'react'

// Tarjeta clicable robusta: usa un manejador de clic real (no un enlace
// absoluto superpuesto con z-index) para que los controles internos
// (botones, enlaces) solo necesiten frenar la propagación del evento
// con stopPropagation en vez de depender de quién quede "por encima"
// visualmente.
export default function ClickableCard({ href, className, style, children }: {
  href: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const router = useRouter()

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      router.push(href)
    }
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={handleKeyDown}
      className={className}
      style={{ cursor: 'pointer', ...style }}
    >
      {children}
    </div>
  )
}
