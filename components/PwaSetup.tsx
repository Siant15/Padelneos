'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const bytes = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i)
  return bytes.buffer
}

function isIos(): boolean {
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true
}

export default function PwaSetup() {
  const supabase = createClient()
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [ios, setIos] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribing, setSubscribing] = useState(false)
  const [pushError, setPushError] = useState('')
  const [pushOk, setPushOk] = useState(false)

  useEffect(() => {
    setStandalone(isStandalone())
    setIos(isIos())
    setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
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
      setShowIosHelp(true)
      return
    }
    await installEvent.prompt()
    setInstallEvent(null)
  }

  async function handleEnableNotifications() {
    setPushError('')
    setSubscribing(true)

    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setPushError('No has dado permiso, así que no podemos avisarte.')
        setSubscribing(false)
        return
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setPushError('Las notificaciones no están configuradas todavía en el servidor.')
        setSubscribing(false)
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No hay sesión')

      const json = subscription.toJSON()
      const { error } = await supabase.from('push_subscriptions').upsert({
        player_id: user.id,
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
      }, { onConflict: 'endpoint' })

      if (error) throw error
      setPushOk(true)
    } catch {
      setPushError('No se pudo activar. Vuelve a intentarlo en unos segundos.')
    } finally {
      setSubscribing(false)
    }
  }

  if (permission === 'unsupported') return null

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3 mt-4" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <h2 className="font-heading text-sm font-bold">📱 Móvil</h2>

      {!standalone && (
        <div>
          <button
            onClick={handleInstall}
            className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            ➕ Instalar app en el móvil
          </button>
          {showIosHelp && ios && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              En iPhone: toca 📤 Compartir en Safari → &quot;Añadir a pantalla de inicio&quot;.
            </p>
          )}
        </div>
      )}

      {permission === 'granted' && !pushOk ? (
        <p className="text-xs" style={{ color: 'var(--green)' }}>✓ Notificaciones activadas en este dispositivo</p>
      ) : (
        <button
          onClick={handleEnableNotifications}
          disabled={subscribing || permission === 'denied'}
          className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90 disabled:opacity-50"
          style={{ background: pushOk ? 'var(--green)' : 'var(--surface2)', color: pushOk ? '#fff' : 'var(--accent)' }}
        >
          {subscribing ? 'Activando...' : pushOk ? '✓ Notificaciones activadas' : '🔔 Activar notificaciones'}
        </button>
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
