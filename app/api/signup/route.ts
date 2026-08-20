import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const { name, email, password, inviteCode } = await request.json()

  if (!name || !email || !password || !inviteCode) {
    return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 })
  }

  if (inviteCode !== process.env.INVITE_CODE) {
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
