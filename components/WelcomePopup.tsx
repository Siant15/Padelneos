'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

const KEY = 'welcome-popup-seen'

// Popup con la imagen de bienvenida al abrir la app: una vez por sesión
// (al cerrar y volver a abrir la app, vuelve a salir). El servidor decide
// si toca por fecha (`active`); aquí solo se recuerda si ya se cerró.
function subscribe() { return () => {} }
function readSeen(): boolean {
  try { return window.sessionStorage.getItem(KEY) === '1' } catch { return false }
}

export default function WelcomePopup({ active }: { active: boolean }) {
  // En el servidor se considera «ya visto» (no se pinta); en el navegador se lee de verdad.
  const seen = useSyncExternalStore(subscribe, readSeen, () => true)
  const [closed, setClosed] = useState(false)
  const open = active && !seen && !closed

  function close() {
    try { window.sessionStorage.setItem(KEY, '1') } catch { /* sin almacenamiento: solo se cierra */ }
    setClosed(true)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida"
    >
      <div className="relative w-full max-w-[440px]" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="absolute -top-3 -right-3 z-10 w-11 h-11 rounded-full flex items-center justify-center text-xl font-bold shadow-lg"
          style={{ background: '#fff', color: 'var(--text)' }}
        >
          ✕
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ads/bienvenida.png"
          alt="Imagen de bienvenida"
          className="block w-full h-auto rounded-2xl"
          style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}
          width={448}
          height={330}
        />
      </div>
    </div>
  )
}
