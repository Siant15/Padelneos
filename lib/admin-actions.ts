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

// ─── Temporadas y jornadas ──────────────────────────────────────────
export type SeasonRow = { id: string; name: string; status: string; minMatches: number; roundCount: number }
export type RoundRow = { id: string; roundNumber: number; scheduledDate: string | null; scheduledTime: string | null; club: string | null; status: string }

export async function listSeasons(): Promise<SeasonRow[]> {
  await assertIsAdmin()
  const admin = adminClient()
  const [{ data: seasons }, { data: rounds }] = await Promise.all([
    admin.from('seasons').select('id, name, status, min_matches').order('created_at', { ascending: false }),
    admin.from('rounds').select('season_id'),
  ])
  const countBySeason = new Map<string, number>()
  for (const r of rounds ?? []) countBySeason.set(r.season_id, (countBySeason.get(r.season_id) ?? 0) + 1)
  return (seasons ?? []).map(s => ({ id: s.id, name: s.name, status: s.status, minMatches: s.min_matches, roundCount: countBySeason.get(s.id) ?? 0 }))
}

export async function listRounds(seasonId: string): Promise<RoundRow[]> {
  await assertIsAdmin()
  const admin = adminClient()
  const { data } = await admin
    .from('rounds')
    .select('id, round_number, scheduled_date, scheduled_time, club, status')
    .eq('season_id', seasonId)
    .order('round_number', { ascending: true })
  return (data ?? []).map(r => ({
    id: r.id, roundNumber: r.round_number, scheduledDate: r.scheduled_date,
    scheduledTime: r.scheduled_time, club: r.club, status: r.status,
  }))
}

export async function deleteRound(roundId: string): Promise<{ error: string | null }> {
  await assertIsAdmin()
  const admin = adminClient()
  const { error } = await admin.from('rounds').delete().eq('id', roundId)
  if (error) return { error: error.message }
  updateTag('liga-data')
  return { error: null }
}

export async function deleteSeason(seasonId: string): Promise<{ error: string | null }> {
  await assertIsAdmin()
  const admin = adminClient()
  const { error } = await admin.from('seasons').delete().eq('id', seasonId)
  if (error) return { error: error.message }
  updateTag('liga-data')
  return { error: null }
}

// ─── Clubs (alta manual, para los que no aparecen en OpenStreetMap) ──
export type ClubRow = { id: string; name: string; address: string | null; mapsUrl: string | null }

export async function listClubs(): Promise<ClubRow[]> {
  await assertIsAdmin()
  const admin = adminClient()
  const { data } = await admin.from('clubs').select('id, name, address, maps_url').order('name')
  return (data ?? []).map(c => ({ id: c.id, name: c.name, address: c.address, mapsUrl: c.maps_url }))
}

export async function addManualClub(name: string, address: string, mapsUrl: string): Promise<{ error: string | null }> {
  await assertIsAdmin()
  if (!name.trim()) return { error: 'El nombre del club es obligatorio.' }

  const finalMapsUrl = mapsUrl.trim() || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, address].filter(Boolean).join(', '))}`

  const admin = adminClient()
  const { error } = await admin
    .from('clubs')
    .upsert({ name: name.trim(), address: address.trim() || null, maps_url: finalMapsUrl }, { onConflict: 'name' })
  if (error) return { error: error.message }
  return { error: null }
}

export async function deleteClub(clubId: string): Promise<{ error: string | null }> {
  await assertIsAdmin()
  const admin = adminClient()
  const { error } = await admin.from('clubs').delete().eq('id', clubId)
  if (error) return { error: error.message }
  return { error: null }
}
