'use client'

import { useRouter } from 'next/navigation'

// «Volver» que nunca se queda mudo: si no hay pantalla anterior (p. ej. se
// entró desde una notificación), lleva al sitio de siempre.
export default function BackButton({ fallback = '/liga' }: { fallback?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className="text-sm min-h-11 pr-3 flex items-center"
      style={{ color: 'var(--text-muted)' }}
    >
      ← Volver
    </button>
  )
}
