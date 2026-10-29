'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { VAPID_KEY, isIos, isStandalone, errorMessage, subscribeToPush } from '@/lib/push-client'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaSetup() {
  const supabase = createClient()
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [ios, setIos] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribing, setSubscribing] = useState(false)
  const [pushError, setPushError] = useState('')
  const [pushOk, setPushOk] = useState(false)

  useEffect(() => {
    setStandalone(isStandalone())
    setIos(isIos())
    setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')

    if ('serviceWorker' in navigator) {
      // "Permiso concedido" no significa "ya suscrito": si un intento
      // anterior falló después de pedir el permiso (p.ej. el guardado en
      // la base de datos), el navegador seguiría diciendo 'granted' sin
      // que exista una suscripción real. Se comprueba de verdad contra
      // el propio pushManager en vez de asumirlo por el permiso.
      navigator.serviceWorker.register('/sw.js').catch(() => {})
      navigator.serviceWorker.ready
        .then(registration => registration.pushManager.getSubscription())
        .then(sub => setPushOk(!!sub))
        .catch(() => {})
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  async function handleInstall() {
    if (!installEvent) {
      setShowHelp(true)
      return
    }
    await installEvent.prompt()
    setInstallEvent(null)
  }

  async function handleEnableNotifications() {
    setPushError('')
    setSubscribing(true)

    try {
      const ok = await subscribeToPush()
      setPermission(Notification.permission)
      if (!ok) {
        setPushError('No has dado permiso, así que no podemos avisarte.')
        return
      }
      setPushOk(true)
    } catch (err) {
      const message = errorMessage(err)
      setPushOk(false)
      setPushError(friendlyError(message, 'No se pudo activar las notificaciones. Inténtalo de nuevo.'))
    } finally {
      setSubscribing(false)
    }
  }

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3 mt-4" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <h2 className="font-heading text-sm font-bold">📱 Móvil</h2>

      {!standalone && ios && (
        <div className="rounded-xl p-3" style={{ background: 'var(--surface2)' }}>
          <p className="text-xs font-bold mb-1.5" style={{ color: 'var(--accent)' }}>En iPhone, instálala así (Apple no deja hacerlo con un botón):</p>
          <ol className="text-xs space-y-1" style={{ color: 'var(--text)' }}>
            <li>1. Toca 📤 <strong>Compartir</strong> en la barra de Safari</li>
            <li>2. Baja y elige <strong>&quot;Añadir a pantalla de inicio&quot;</strong></li>
            <li>3. Toca <strong>&quot;Añadir&quot;</strong> arriba a la derecha</li>
          </ol>
        </div>
      )}

      {!standalone && !ios && (
        <div>
          <button
            onClick={handleInstall}
            className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            ➕ Instalar app en el móvil
          </button>
          {showHelp && (
            <p className="text-xs mt-2 font-bold" style={{ color: 'var(--orange)' }}>
              Tu navegador no ofrece el diálogo automático ahora. Busca &quot;Instalar app&quot; o &quot;Añadir a pantalla de inicio&quot; en el menú ⋮ del navegador.
            </p>
          )}
        </div>
      )}

      {!VAPID_KEY ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          🔔 Las notificaciones todavía no están configuradas en el servidor. En cuanto lo estén, este botón se activará solo.
        </p>
      ) : permission === 'unsupported' ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {ios && !standalone
            ? '🔔 Las notificaciones en iPhone solo funcionan una vez instalada la app (botón de arriba). Después, ábrela desde el icono y vuelve aquí para activarlas.'
            : '🔔 Este navegador no admite notificaciones.'}
        </p>
      ) : (
        <div>
          {!pushOk && (
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              Te avisamos el día antes y 2h antes de cada partido, si alguien apuesta en tu contra 1h antes, cuando se abren las apuestas y cuando se liquida tu jornada.
            </p>
          )}
          <button
            onClick={handleEnableNotifications}
            disabled={subscribing || permission === 'denied'}
            className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ background: pushOk ? 'var(--green)' : 'var(--surface2)', color: pushOk ? '#fff' : 'var(--accent)' }}
          >
            {subscribing ? 'Activando...' : pushOk ? '✓ Notificaciones activadas' : '🔔 Activar notificaciones'}
          </button>
        </div>
      )}
      {permission === 'denied' && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Bloqueaste las notificaciones para esta web. Actívalas desde los ajustes del navegador si cambias de opinión.
        </p>
      )}
      {pushError && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {pushError}</p>}
    </div>
  )
}
