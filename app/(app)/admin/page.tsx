import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { listMembers } from '@/lib/admin-actions'
import AdminPanel from '@/components/AdminPanel'

export default async function AdminPage() {
  const user = await getCachedUser()
  if (!isAdminUser(user)) redirect('/dashboard')

  const members = await listMembers()

  return (
    <div>
      <h1 className="font-heading text-[22px] font-extrabold mb-1">Administración</h1>
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        Añadir, eliminar y gestionar contraseñas de los miembros de la liga.
      </p>
      <AdminPanel members={members} />
    </div>
  )
}
