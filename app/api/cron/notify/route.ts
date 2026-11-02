import { sortIndividualStandings } from '@/lib/standings'
import type { IndividualStanding } from '@/lib/types'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createPushAdminClient, sendPushToAll } from '@/lib/push'
import { madridDateTimeToUtc } from '@/lib/betting'
import webpush from 'web-push'

// Una jornada solo cuenta como "reserva confirmada" cuando tiene día,
// hora y club (la reserva registrada). La fecha sola (la que deja
// `generate_season_rounds` al crear el calendario) no es suficiente,
// todavía puede cambiar. El precio de la pista NO se exige: solo lo puede
// escribir quien paga y, si no lo pone, no tiene que dejar a todos sin aviso.
function isRoundConfirmed(round: { scheduled_date: string | null; scheduled_time: string | null; club: string | null }): boolean {
  return !!(round.scheduled_date && round.scheduled_time && round.club)
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
  // 'reminder120' es el nombre antiguo del aviso previo al partido: se acepta
  // como alias para no romper el workflow de GitHub mientras se despliega.
  if (type !== 'dayBefore' && type !== 'reminder' && type !== 'reminder120') {
    return NextResponse.json({ error: 'type debe ser dayBefore o reminder' }, { status: 400 })
  }

  const admin = createPushAdminClient()

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

  // La temporada ya no se cierra sola: la cierra un jugador cuando termina
  // (botón «Cerrar la liga», RPC finish_season, migración 067).

  const { data: round } = await admin
    .from('rounds')
    .select('id, round_number, scheduled_date, scheduled_time, club, court_cost, reminder_120_sent_at, day_before_sent_at, court_booker:profiles!court_booker_id(name), match:matches(team1_p1:profiles!team1_p1_id(name), team1_p2:profiles!team1_p2_id(name), team2_p1:profiles!team2_p1_id(name), team2_p2:profiles!team2_p2_id(name))')
    .eq('season_id', season.id)
    .eq('scheduled_date', targetDate)
    .eq('status', 'scheduled')
    .maybeSingle()

  if (!round) return NextResponse.json({ sent: 0, reason: type === 'dayBefore' ? 'no hay jornada mañana' : 'no hay jornada hoy' })

  // Sin las 4 cosas confirmadas (fecha, hora, club y precio de pista)
  // no se manda ningún aviso — solo tener la fecha (p. ej. recién
  // generada al crear el calendario) no cuenta como partido confirmado.
  if (!isRoundConfirmed(round)) {
    return NextResponse.json({ sent: 0, reason: 'la reserva todavía no está confirmada (falta fecha, hora o club)' })
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

  // "reminder": se llama cada ~15 min (GitHub Actions, no cron de Vercel
  // — el plan Hobby no permite crons más frecuentes que 1/día). Un solo
  // aviso por partido, a falta de ~1 h: justo cuando el mercado de
  // apuestas ya cerró (cierra 1 h antes), así que ya se puede decir si
  // alguien ha apostado en tu contra sin revelar nada a destiempo.
  // Se envía en la primera comprobación que llegue a 60 min o menos antes
  // del partido (y todavía falten más de 5): el workflow de GitHub corre
  // cada 15 min y a veces se retrasa, así que no hay una ventana estrecha
  // que se pueda perder. `reminder_120_sent_at` conserva su nombre antiguo
  // pero marca "ya avisado" para este aviso.
  if (round.reminder_120_sent_at) return NextResponse.json({ sent: 0, reason: 'ya se avisó para esta jornada' })

  const matchDateTime = madridDateTimeToUtc(round.scheduled_date!, round.scheduled_time!)
  const minutesUntil = (matchDateTime.getTime() - now.getTime()) / 60000
  if (minutesUntil <= 5 || minutesUntil > 60) {
    return NextResponse.json({ sent: 0, reason: `fuera de ventana (quedan ${Math.round(minutesUntil)} min)` })
  }

  // Mensaje personalizado según la clasificación de cada jugador (y si
  // alguien ha apostado en su contra), así que no puede ir por
  // sendPushToAll (payload único para todos) — se manda uno a uno.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)

  const { data: subs } = await admin.from('push_subscriptions').select('*')
  if (!subs?.length) return NextResponse.json({ sent: 0, reason: 'nadie suscrito' })

  const { data: standings } = await admin
    .from('individual_standings')
    .select('*')
    .eq('season_id', season.id)
  const ranked = sortIndividualStandings((standings ?? []) as IndividualStanding[])
  const betAgainst = await playersWithBetsAgainst(admin, round.id)

  let sent = 0
  const toDelete: string[] = []
  for (const sub of subs) {
    const rank = ranked.findIndex(r => r.player_id === sub.player_id)
    const line = rank === -1 ? 'Esta noche, a por todas 🎾' : pickLine(rank, ranked.length)
    const against = betAgainst.has(sub.player_id)
    const payload = {
      title: '⏰ El partido empieza en 1 h',
      body: against ? `${line}\n🎲 Alguien ha apostado en tu contra` : line,
      url: against ? '/liga?tab=apuestas' : '/dashboard',
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 3600 }
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

// Jugadores sobre los que otro jugador ha apostado EN CONTRA: apuestas de
// otros a una opción "negativa" de ese jugador (las que no se pueden
// apostar sobre uno mismo, `is_self_negative`). Nunca dice quién apostó ni
// cuántas fichas. Se llama con el mercado ya cerrado.
async function playersWithBetsAgainst(admin: SupabaseClient, roundId: string): Promise<Set<string>> {
  const { data: markets } = await admin
    .from('betting_markets')
    .select('id, options:betting_options!market_id(id, player_id, is_self_negative)')
    .eq('round_id', roundId)
    .eq('type', 'player')

  const optionToPlayer = new Map<string, string>()
  for (const m of markets ?? []) {
    for (const o of (m.options as { id: string; player_id: string | null; is_self_negative: boolean }[] | null) ?? []) {
      if (o.player_id && o.is_self_negative) optionToPlayer.set(o.id, o.player_id)
    }
  }

  const targets = new Set<string>()
  if (optionToPlayer.size === 0) return targets
  const { data: betRows } = await admin.from('bets').select('option_id, player_id').in('option_id', [...optionToPlayer.keys()])
  for (const b of betRows ?? []) {
    const target = optionToPlayer.get(b.option_id)
    if (target && b.player_id !== target) targets.add(target)
  }
  return targets
}
