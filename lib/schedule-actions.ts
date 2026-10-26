'use server'

import { createClient, getCachedUser } from '@/lib/supabase/server'
import { addDays, daysUntilNextRound } from '@/lib/schedule'
import { updateTag } from 'next/cache'

// Recoloca las jornadas pendientes que vienen detrás de `roundId`: cada una
// va 7 días después de la anterior (14 tras cada 3 partidos). Se llama al
// jugar una jornada o al cambiarle la fecha. Las jornadas ya jugadas y las
// que tienen la pista confirmada no se mueven: son anclas reales.
export async function rescheduleFollowingRounds(roundId: string): Promise<{ error: string | null }> {
  const user = await getCachedUser()
  if (!user) return { error: 'No hay sesión' }

  const supabase = await createClient()
  const { data: round } = await supabase
    .from('rounds')
    .select('season_id, round_number, scheduled_date')
    .eq('id', roundId)
    .maybeSingle()
  if (!round?.scheduled_date) return { error: null }

  const { data: later, error } = await supabase
    .from('rounds')
    .select('id, round_number, scheduled_date, status, court_confirmed')
    .eq('season_id', round.season_id)
    .gt('round_number', round.round_number)
    .order('round_number')
  if (error) return { error: error.message }

  let prevDate: string = round.scheduled_date
  let prevNumber: number = round.round_number
  const moves: { id: string; date: string }[] = []

  for (const r of later ?? []) {
    if (r.status === 'cancelled') continue
    if (r.status === 'played' || r.court_confirmed) {
      prevDate = r.scheduled_date ?? prevDate
      prevNumber = r.round_number
      continue
    }
    const next = addDays(prevDate, daysUntilNextRound(prevNumber))
    if (r.scheduled_date !== next) moves.push({ id: r.id, date: next })
    prevDate = next
    prevNumber = r.round_number
  }

  const results = await Promise.all(moves.map(m => supabase.from('rounds').update({ scheduled_date: m.date }).eq('id', m.id)))
  const failed = results.find(r => r.error)
  if (failed?.error) return { error: failed.error.message }

  if (moves.length) updateTag('liga-data')
  return { error: null }
}
