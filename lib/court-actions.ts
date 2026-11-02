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
  const { data: round, error: readError } = await supabase
    .from('rounds')
    .select('round_number, scheduled_date, scheduled_time, club, status, court_confirmed')
    .eq('id', roundId)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!round) return { error: 'No se encontró la jornada' }
  if (round.status !== 'scheduled') return { error: 'Esta jornada ya no está programada' }
  if (!round.scheduled_date || !round.scheduled_time || !round.club) {
    return { error: 'Faltan día, hora o club para confirmar la reserva' }
  }
  // Ya confirmada: no se vuelve a avisar a nadie.
  if (round.court_confirmed) return { error: null }

  // El filtro court_confirmed = false hace que, si dos personas confirman a
  // la vez, solo una cambie la fila (y solo esa manda el aviso).
  const { data: updated, error } = await supabase
    .from('rounds')
    .update({ court_confirmed: true })
    .eq('id', roundId)
    .eq('court_confirmed', false)
    .select('id')
  if (error) return { error: error.message }

  updateTag('liga-data')
  if (!updated?.length) return { error: null }

  // El aviso push es "a mejor esfuerzo": si falla, la reserva ya quedó
  // confirmada de todas formas y no queremos que el usuario vea un
  // error por algo que no depende de él.
  try {
    const admin = createPushAdminClient()
    const body = [
      [formatDate(round.scheduled_date), formatTime(round.scheduled_time)].join(' · '),
      round.club,
      'Haz tus apuestas',
    ].join('\n')

    await sendPushToAll(admin, {
      title: `💰 Apuestas abiertas · Jornada ${round.round_number}`,
      body,
      url: '/liga?tab=apuestas',
    })
  } catch {
    // best-effort, no bloquea la confirmación
  }

  return { error: null }
}
