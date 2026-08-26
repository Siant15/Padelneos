import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

// Único sitio que sabe enviar un push a todos los suscritos y limpiar
// las suscripciones caducadas (404/410) — lo usan tanto el cron diario
// como cualquier acción puntual (p. ej. confirmar la reserva).
export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

export function createPushAdminClient(): SupabaseClient {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type PushPayload = { title: string; body: string; url?: string }

export async function sendPushToAll(admin: SupabaseClient, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!isPushConfigured()) return { sent: 0, removed: 0 }

  const { data: subs } = await admin.from('push_subscriptions').select('*')
  if (!subs?.length) return { sent: 0, removed: 0 }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  let sent = 0
  const toDelete: string[] = []
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...payload, url: payload.url ?? '/dashboard' })
      )
      sent++
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) toDelete.push(sub.id)
    }
  }

  if (toDelete.length) {
    await admin.from('push_subscriptions').delete().in('id', toDelete)
  }

  return { sent, removed: toDelete.length }
}
