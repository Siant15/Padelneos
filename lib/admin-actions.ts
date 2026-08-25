'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/server'
import { isAdminUser, ADMIN_EMAIL } from '@/lib/admin'
import { updateTag } from 'next/cache'

// Cada acción vuelve a comprobar quién la llama con service_role — la
// pantalla de administración ya está protegida (app/(app)/admin/page.tsx
// redirige si no eres tú), pero una Server Action es un endpoint público
// por su cuenta, así que no basta con esconder el botón en la UI.
async function assertIsAdmin() {
  const user = await getCachedUser()
  if (!isAdminUser(user)) throw new Error('No autorizado')
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type MemberRow = { id: string; name: string; email: string; avatarUrl: string | null; isAdmin: boolean }

export async function listMembers(): Promise<MemberRow[]> {
  await assertIsAdmin()
  const admin = adminClient()

  const [{ data: profiles }, { data: usersPage }] = await Promise.all([
    admin.from('profiles').select('id, name, avatar_url').order('created_at'),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ])

  const emailById = new Map((usersPage?.users ?? []).map(u => [u.id, u.email ?? '']))

  return (profiles ?? []).map(p => ({
    id: p.id,
    name: p.name,
    email: emailById.get(p.id) ?? '',
    avatarUrl: p.avatar_url,
    isAdmin: emailById.get(p.id) === ADMIN_EMAIL,
  }))
}

export async function addMember(name: string, email: string, password: string): Promise<{ error: string | null }> {
  await assertIsAdmin()
  if (!name.trim() || !email.trim() || password.length < 8) {
    return { error: 'Nombre, email y una contraseña de al menos 8 caracteres son obligatorios.' }
  }

  const admin = adminClient()
  const { error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { name: name.trim() },
  })

  if (error) {
    const message = error.message.toLowerCase().includes('already been registered')
      ? 'Ese email ya está registrado.'
      : error.message
    return { error: message }
  }

  updateTag('liga-data')
  return { error: null }
}

export async function changeMemberPassword(playerId: string, newPassword: string): Promise<{ error: string | null }> {
  await assertIsAdmin()
  if (newPassword.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' }

  const admin = adminClient()
  const { error } = await admin.auth.admin.updateUserById(playerId, { password: newPassword })
  if (error) return { error: error.message }
  return { error: null }
}

export async function removeMember(playerId: string): Promise<{ error: string | null }> {
  await assertIsAdmin()
  const user = await getCachedUser()
  if (user?.id === playerId) return { error: 'No puedes eliminarte a ti mismo.' }

  const admin = adminClient()
  const { error } = await admin.auth.admin.deleteUser(playerId)
  if (error) {
    const message = error.message.toLowerCase().includes('foreign key') || error.message.toLowerCase().includes('violates')
      ? 'No se puede eliminar: tiene partidos, apuestas u otros datos asociados en la liga.'
      : error.message
    return { error: message }
  }

  updateTag('liga-data')
  return { error: null }
}
