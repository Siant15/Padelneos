import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Freno básico contra fuerza bruta del código de invitación: máximo 5
// intentos fallidos cada 15 minutos por IP. No sobrevive a un reinicio
// de la instancia serverless, pero basta para desanimar un script simple
// en una app privada de 4 amigos.
const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS })
    return false
  }
  return entry.count >= MAX_ATTEMPTS
}

function registerFailedAttempt(ip: string) {
  const entry = attempts.get(ip)
  if (entry) entry.count++
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.' }, { status: 429 })
  }

  const { name, email, password, inviteCode } = await request.json()

  if (!name || !email || !password || !inviteCode) {
    return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 })
  }

  if (inviteCode !== process.env.INVITE_CODE) {
    registerFailedAttempt(ip)
    return NextResponse.json({ error: 'Código de invitación incorrecto.' }, { status: 403 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (error) {
    const message = error.message.toLowerCase().includes('already been registered')
      ? 'Ese email ya está registrado.'
      : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
