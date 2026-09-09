import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createPushAdminClient, sendPushToAll, sendPushToPlayers } from '@/lib/push'
import { madridDateTimeToUtc } from '@/lib/betting'
import webpush from 'web-push'

// Una jornada solo cuenta como "reserva confirmada" cuando tiene las
// 4 cosas a la vez: fecha, hora, club y precio de la pista. Sin las
// 4, no se manda ningún aviso de "toca partido" — la fecha sola (la
// que deja `generate_season_rounds` al crear el calendario) no es
// suficiente, todavía puede cambiar o cancelarse.
function isRoundConfirmed(round: { scheduled_date: string | null; scheduled_time: string | null; club: string | null; court_cost: number | null }): boolean {
  return !!(round.scheduled_date && round.scheduled_time && round.club && round.court_cost != null)
}

// Mensajes "picantes" según la posición en la clasificación, para el
// recordatorio de última hora. Nunca los mismos dos veces seguidas sería
// ideal, pero con 4 jugadores y un cron diario no merece la pena la
// complejidad.
const TOP_LINES = ['Vas primero. No la líes esta noche 😏', 'Líder de la liga. A mantenerlo 🏆']
const MID_LINES = ['Terreno de nadie. Esta noche decide 🎾', 'Ni arriba ni abajo... todavía']
const BOTTOM_LINES = ['Si no aprietas, pagas la cena 🍽️', 'Que la presión no te pueda esta noche', 'El último puesto invita, no tú']

function pickLine(rank: number, total: number): string {
  if (rank === 1) return TOP_LINES[rank % TOP_LINES.length]
  if (rank >= total - 1) return BOTTOM_LINES[rank % BOTTOM_LINES.length]
  return MID_LINES[rank % MID_LINES.length]
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  if (!process.env.VAPID_SUBJECT || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Faltan variables VAPID en el entorno' }, { status: 500 })
  }

  const type = new URL(request.url).searchParams.get('type')
  if (type !== 'dayBefore' && type !== 'reminder120' && type !== 'betAgainstYou') {
    return NextResponse.json({ error: 'type debe ser dayBefore, reminder120 o betAgainstYou' }, { status: 400 })
  }

  const admin = createPushAdminClient()

  if (type === 'betAgainstYou') {
    return handleBetAgainstYou(admin)
  }

  // "Hoy" y "mañana" en huso de Barcelona/Madrid (España solo tiene un
  // huso, Europe/Madrid), no en UTC del servidor.
  const now = new Date()
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const targetDate = type === 'dayBefore' ? tomorrow : today

  const { data: season } = await admin
    .from('seasons')
    .select('id, default_club, match_time')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!season) return NextResponse.json({ sent: 0, reason: 'sin temporada activa' })

  // Si la última jornada no cancelada se jugó hace más de 2 semanas,
  // la temporada se considera terminada y se cierra sola (sin esperar
  // a que alguien entre a finalizarla a mano).
  const { data: lastRound } = await admin
    .from('rounds')
    .select('scheduled_date')
    .eq('season_id', season.id)
    .neq('status', 'cancelled')
    .not('scheduled_date', 'is', null)
    .order('scheduled_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastRound) {
    const twoWeeksAfter = new Date(lastRound.scheduled_date + 'T12:00:00')
    twoWeeksAfter.setDate(twoWeeksAfter.getDate() + 14)
    if (twoWeeksAfter < new Date()) {
      await admin.from('seasons').update({ status: 'finished' }).eq('id', season.id)
      return NextResponse.json({ sent: 0, reason: 'temporada cerrada automáticamente (2 semanas sin partidos)' })
    }
  }

  const { data: round } = await admin
    .from('rounds')
    .select('id, round_number, scheduled_date, scheduled_time, club, court_cost, reminder_120_sent_at, day_before_sent_at, court_booker:profiles!court_booker_id(name), match:matches(team1_p1:profiles!team1_p1_id(name), team1_p2:profiles!team1_p2_id(name), team2_p1:profiles!team2_p1_id(name), team2_p2:profiles!team2_p2_id(name))')
    .eq('season_id', season.id)
    .eq('scheduled_date', targetDate)
    .maybeSingle()

  if (!round) return NextResponse.json({ sent: 0, reason: type === 'dayBefore' ? 'no hay jornada mañana' : 'no hay jornada hoy' })

  // Sin las 4 cosas confirmadas (fecha, hora, club y precio de pista)
  // no se manda ningún aviso — solo tener la fecha (p. ej. recién
  // generada al crear el calendario) no cuenta como partido confirmado.
  if (!isRoundConfirmed(round)) {
    return NextResponse.json({ sent: 0, reason: 'la reserva todavía no está confirmada (falta fecha, hora, club o precio de pista)' })
  }

  const time = round.scheduled_time!.slice(0, 5)
  const club = round.club!
  const match = round.match as unknown as { team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string } } | null
  const booker = (Array.isArray(round.court_booker) ? round.court_booker[0] : round.court_booker) as { name: string } | null

  if (type === 'dayBefore') {
    if (round.day_before_sent_at) return NextResponse.json({ sent: 0, reason: 'ya se avisó para esta jornada' })
    const pairing = match
      ? `${match.team1_p1?.name} & ${match.team1_p2?.name} vs ${match.team2_p1?.name} & ${match.team2_p2?.name}`
      : `Emparejamiento por confirmar (reserva: ${booker?.name ?? 'sin asignar'})`
    const body = [pairing, `⏰ ${time} · 📍 ${club}`].filter(Boolean).join('\n')
    const result = await sendPushToAll(admin, { title: `🎾 Mañana toca partido · Jornada ${round.round_number}`, body, url: '/dashboard' })
    await admin.from('rounds').update({ day_before_sent_at: now.toISOString() }).eq('id', round.id)
    return NextResponse.json(result)
  }

  // "reminder120": se llama cada ~15 min (GitHub Actions, no cron de
  // Vercel — el plan Hobby no permite crons más frecuentes que 1/día).
  // Solo manda el aviso si el partido empieza dentro de los próximos
  // 105-135 min (ventana centrada en 120 y con margen para el propio
  // intervalo de 15 min entre comprobaciones) y todavía no se avisó.
  if (round.reminder_120_sent_at) return NextResponse.json({ sent: 0, reason: 'ya se avisó para esta jornada' })

  const matchDateTime = madridDateTimeToUtc(round.scheduled_date!, round.scheduled_time!)
  const minutesUntil = (matchDateTime.getTime() - now.getTime()) / 60000
  if (minutesUntil < 105 || minutesUntil > 135) {
    return NextResponse.json({ sent: 0, reason: `fuera de ventana (quedan ${Math.round(minutesUntil)} min)` })
  }

  // Mensaje personalizado según la clasificación de cada jugador, así
  // que no puede ir por sendPushToAll (payload único para todos) — se
  // manda uno a uno.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)

  const { data: subs } = await admin.from('push_subscriptions').select('*')
  if (!subs?.length) return NextResponse.json({ sent: 0, reason: 'nadie suscrito' })

  const { data: standings } = await admin
    .from('individual_standings')
    .select('player_id')
    .eq('season_id', season.id)
    .order('total_points', { ascending: false })
    .order('sport_points', { ascending: false })
  const ranked = standings ?? []

  let sent = 0
  const toDelete: string[] = []
  for (const sub of subs) {
    const rank = ranked.findIndex(r => r.player_id === sub.player_id)
    const line = rank === -1 ? 'Esta noche, a por todas 🎾' : pickLine(rank, ranked.length)
    const payload = { title: '⏰ El partido empieza en 120 min', body: line, url: '/dashboard' }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
      sent++
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) toDelete.push(sub.id)
    }
  }
  if (toDelete.length) await admin.from('push_subscriptions').delete().in('id', toDelete)
  await admin.from('rounds').update({ reminder_120_sent_at: now.toISOString() }).eq('id', round.id)

  return NextResponse.json({ sent, removed: toDelete.length })
}

// Aviso "alguien ha apostado en tu contra" — se comprueba cada ~15 min
// (mismo workflow de GitHub Actions) y solo avisa una vez por
// jornada, a los 60 min del partido, y solo si de verdad hay al menos
// una apuesta hecha sobre la opción de ese jugador en una pregunta de
// tipo "jugador" (nunca dice quién apostó ni cuántas fichas).
async function handleBetAgainstYou(admin: SupabaseClient) {
  const now = new Date()

  const { data: rounds } = await admin
    .from('rounds')
    .select('id, round_number, scheduled_date, scheduled_time, bet_against_notified_at')
    .eq('status', 'scheduled')
    .is('bet_against_notified_at', null)
    .not('scheduled_date', 'is', null)
    .not('scheduled_time', 'is', null)

  if (!rounds?.length) return NextResponse.json({ sent: 0, reason: 'sin jornadas pendientes de aviso' })

  let totalSent = 0
  const notifiedRounds: string[] = []

  for (const round of rounds) {
    const matchDateTime = madridDateTimeToUtc(round.scheduled_date!, round.scheduled_time!)
    const minutesUntilMatch = (matchDateTime.getTime() - now.getTime()) / 60000
    // Ventana de aviso: centrada en 60 min antes del partido, con
    // margen de ±15 min para el propio intervalo entre comprobaciones.
    if (minutesUntilMatch < 45 || minutesUntilMatch > 75) continue

    const { data: markets } = await admin
      .from('betting_markets')
      .select('id, options:betting_options(id, player_id)')
      .eq('round_id', round.id)
      .eq('type', 'player')

    const optionToPlayer = new Map<string, string>()
    for (const m of markets ?? []) {
      for (const o of (m.options as { id: string; player_id: string | null }[] | null) ?? []) {
        if (o.player_id) optionToPlayer.set(o.id, o.player_id)
      }
    }

    const targetPlayerIds = new Set<string>()
    if (optionToPlayer.size > 0) {
      const { data: betRows } = await admin.from('bets').select('option_id').in('option_id', [...optionToPlayer.keys()])
      for (const b of betRows ?? []) {
        const playerId = optionToPlayer.get(b.option_id)
        if (playerId) targetPlayerIds.add(playerId)
      }
    }

    if (targetPlayerIds.size > 0) {
      const result = await sendPushToPlayers(admin, [...targetPlayerIds], {
        title: '🎲 Alguien ha apostado en tu contra',
        body: `Jornada ${round.round_number} — se ha hecho una apuesta sobre ti antes del partido.`,
        url: '/liga?tab=apuestas',
      })
      totalSent += result.sent
    }

    await admin.from('rounds').update({ bet_against_notified_at: now.toISOString() }).eq('id', round.id)
    notifiedRounds.push(round.id)
  }

  return NextResponse.json({ sent: totalSent, rounds: notifiedRounds })
}
