import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import webpush from 'web-push'

// Mensajes "picantes" según la posición en la clasificación, para el
// aviso de las 18:00. Nunca los mismos dos veces seguidas sería ideal,
// pero con 4 jugadores y un cron diario no merece la pena la complejidad.
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
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const type = new URL(request.url).searchParams.get('type')
  if (type !== 'morning' && type !== 'evening') {
    return NextResponse.json({ error: 'type debe ser morning o evening' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) // YYYY-MM-DD

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
    .select('id, round_number, scheduled_time, club, court_booker:profiles!court_booker_id(name), match:matches(team1_p1:profiles!team1_p1_id(name), team1_p2:profiles!team1_p2_id(name), team2_p1:profiles!team2_p1_id(name), team2_p2:profiles!team2_p2_id(name))')
    .eq('season_id', season.id)
    .eq('scheduled_date', today)
    .maybeSingle()

  if (!round) return NextResponse.json({ sent: 0, reason: 'no hay jornada hoy' })

  const { data: subs } = await admin.from('push_subscriptions').select('*')
  if (!subs?.length) return NextResponse.json({ sent: 0, reason: 'nadie suscrito' })

  const time = (round.scheduled_time ?? season.match_time)?.slice(0, 5) ?? ''
  const club = round.club ?? season.default_club ?? ''
  const match = round.match as unknown as { team1_p1?: { name: string }; team1_p2?: { name: string }; team2_p1?: { name: string }; team2_p2?: { name: string } } | null
  const booker = (Array.isArray(round.court_booker) ? round.court_booker[0] : round.court_booker) as { name: string } | null

  let payloadFor: (playerId: string) => { title: string; body: string }

  if (type === 'morning') {
    const pairing = match
      ? `${match.team1_p1?.name} & ${match.team1_p2?.name} vs ${match.team2_p1?.name} & ${match.team2_p2?.name}`
      : `Emparejamiento por confirmar (reserva: ${booker?.name ?? 'sin asignar'})`
    const body = [pairing, [time && `⏰ ${time}`, club && `📍 ${club}`].filter(Boolean).join(' · ')].filter(Boolean).join('\n')
    payloadFor = () => ({ title: `🎾 Partido hoy · Jornada ${round.round_number}`, body })
  } else {
    const { data: standings } = await admin
      .from('individual_standings')
      .select('player_id')
      .eq('season_id', season.id)
      .order('total_points', { ascending: false })
      .order('sport_points', { ascending: false })
    const ranked = standings ?? []
    payloadFor = (playerId: string) => {
      const rank = ranked.findIndex(r => r.player_id === playerId)
      const line = rank === -1 ? 'Esta noche, a por todas 🎾' : pickLine(rank, ranked.length)
      return { title: '🤫 Esta noche toca partido', body: line }
    }
  }

  let sent = 0
  const toDelete: string[] = []

  for (const sub of subs) {
    const payload = payloadFor(sub.player_id)
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...payload, url: '/dashboard' })
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

  return NextResponse.json({ sent, removed: toDelete.length })
}
