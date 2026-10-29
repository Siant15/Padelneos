'use client'

import { useEffect, useState } from 'react'
import { friendlyError } from '@/lib/errors'
import { VAPID_KEY, isIos, isStandalone, errorMessage, subscribeToPush } from '@/lib/push-client'

const DISMISS_KEY = 'push-card-dismissed-at'
const DISMISS_DAYS = 7

type Mode = 'hidden' | 'enable' | 'ios-install' | 'blocked'

// Tarjeta de Inicio para quien aún no tiene los avisos activados. Desaparece
// sola al activarlos; "Ahora no" la oculta 7 días.
export default function EnableNotificationsCard() {
  const [mode, setMode] = useState<Mode>('hidden')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!VAPID_KEY) return
      try {
        const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
        if (at && Date.now() - at < DISMISS_DAYS * 86400000) return
      } catch {}

      if (typeof Notification === 'undefined') {
        if (isIos() && !isStandalone()) setMode('ios-install')
        return
      }
      if (Notification.permission === 'denied') { setMode('blocked'); return }
      if (!('serviceWorker' in navigator)) return

      const sub = await navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).catch(() => undefined)
      if (!cancelled && sub === null) setMode('enable')
    }
    void check()
    return () => { cancelled = true }
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setMode('hidden')
  }

  async function enable() {
    setBusy(true)
    setError('')
    try {
      const ok = await subscribeToPush()
      if (ok) setMode('hidden')
      else if (Notification.permission === 'denied') setMode('blocked')
      else setError('No has dado permiso, así que no podemos avisarte.')
    } catch (err) {
      setError(friendlyError(errorMessage(err), 'No se pudo activar las notificaciones. Inténtalo de nuevo.'))
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'hidden') return null

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      {mode === 'enable' && (
        <>
          <h2 className="font-heading text-sm font-bold">🔔 Activa los avisos</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Te avisamos cuando se confirma la reserva, el día antes y 2 h antes del partido, y si alguien apuesta en tu contra.
          </p>
          <button
            onClick={enable}
            disabled={busy}
            className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {busy ? 'Activando...' : 'Activar notificaciones'}
          </button>
          <button onClick={dismiss} className="text-xs font-bold self-center" style={{ color: 'var(--text-muted)' }}>Ahora no</button>
        </>
      )}
      {mode === 'ios-install' && (
        <>
          <h2 className="font-heading text-sm font-bold">🔔 Activa los avisos en iPhone</h2>
          <ol className="text-xs space-y-1" style={{ color: 'var(--text)' }}>
            <li>1. Toca 📤 <strong>Compartir</strong> en Safari y elige <strong>&quot;Añadir a pantalla de inicio&quot;</strong></li>
            <li>2. Abre la app desde el icono y vuelve aquí para activarlos</li>
          </ol>
          <button onClick={dismiss} className="text-xs font-bold self-center" style={{ color: 'var(--text-muted)' }}>Ahora no</button>
        </>
      )}
      {mode === 'blocked' && (
        <>
          <h2 className="font-heading text-sm font-bold" style={{ color: 'var(--orange)' }}>🔕 Los avisos están bloqueados</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Toca el candado junto a la dirección, entra en Permisos y pon Notificaciones en &quot;Permitir&quot;. Luego vuelve aquí.
          </p>
          <button onClick={dismiss} className="text-xs font-bold self-center" style={{ color: 'var(--text-muted)' }}>Ahora no</button>
        </>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
    </div>
  )
}
