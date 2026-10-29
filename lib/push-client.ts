import { createClient } from '@/lib/supabase/client'

export const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const bytes = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i)
  return bytes.buffer
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true
}

export function errorMessage(err: unknown): string {
  // Los errores de Supabase (PostgrestError) son objetos planos con
  // `.message`, no instancias de Error — String(err) da "[object Object]".
  return err instanceof Error
    ? err.message
    : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message) : String(err)
}

// Pide el permiso, crea la suscripción push y la guarda para el usuario.
// Devuelve false si el usuario no concede el permiso; lanza si falla otro paso.
export async function subscribeToPush(): Promise<boolean> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_KEY!),
  })

  const supabase = createClient()
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
  return true
}
