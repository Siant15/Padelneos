'use server'

import { createClient, getCachedUser } from '@/lib/supabase/server'
import { createPushAdminClient, sendPushToAll } from '@/lib/push'
import { formatDate, formatTime } from '@/lib/types'
import { updateTag } from 'next/cache'

// Confirmar la reserva es el momento en que de verdad se sabe que la
// jornada va a jugarse, así que es cuando tiene sentido avisar de que
// las apuestas están abiertas — no antes (aún podría cambiar día/hora)
// ni con un cron aparte que tendría que adivinar cuándo se confirmó.
export async function confirmCourtReservation(roundId: string): Promise<{ error: string | null }> {
  const user = await getCachedUser()
  if (!user) return { error: 'No hay sesión' }

  const supabase = await createClient()
  const { error } = await supabase.from('rounds').update({ court_confirmed: true }).eq('id', roundId)
  if (error) return { error: error.message }

  updateTag('liga-data')

  // El aviso push es "a mejor esfuerzo": si falla, la reserva ya quedó
  // confirmada de todas formas y no queremos que el usuario vea un
  // error por algo que no depende de él.
  try {
    const admin = createPushAdminClient()
    const { data: round } = await admin.from('rounds').select('round_number, scheduled_date, scheduled_time, club').eq('id', roundId).maybeSingle()
    if (round) {
      const dateLabel = round.scheduled_date ? formatDate(round.scheduled_date) : null
      const timeLabel = round.scheduled_time ? formatTime(round.scheduled_time) : null
      const body = [
        [dateLabel, timeLabel].filter(Boolean).join(' · '),
        round.club ?? null,
        'Haz tus apuestas',
      ].filter(Boolean).join('\n')

      await sendPushToAll(admin, {
        title: `💰 Apuestas abiertas · Jornada ${round.round_number}`,
        body,
        url: '/liga?tab=apuestas',
      })
    }
  } catch {
    // best-effort, no bloquea la confirmación
  }

  return { error: null }
}
