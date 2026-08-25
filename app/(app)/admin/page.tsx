import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { listMembers, listSeasons, listClubs } from '@/lib/admin-actions'
import AdminPanel from '@/components/AdminPanel'
import AdminSeasons from '@/components/AdminSeasons'
import AdminClubs from '@/components/AdminClubs'

export default async function AdminPage() {
  const user = await getCachedUser()
  if (!isAdminUser(user)) redirect('/dashboard')

  const [members, seasons, clubs] = await Promise.all([listMembers(), listSeasons(), listClubs()])

  return (
    <div className="flex flex-col gap-6 overflow-x-hidden">
      <div>
        <h1 className="font-heading text-[22px] font-extrabold mb-1">Administración</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Miembros, temporadas y jornadas de la liga.
        </p>
      </div>

      <div>
        <h2 className="font-heading font-bold text-sm mb-2.5">Miembros</h2>
        <AdminPanel members={members} />
      </div>

      <div>
        <h2 className="font-heading font-bold text-sm mb-2.5">Temporadas y jornadas</h2>
        <AdminSeasons seasons={seasons} />
      </div>

      <div>
        <h2 className="font-heading font-bold text-sm mb-2.5">Clubs</h2>
        <AdminClubs clubs={clubs} />
      </div>
    </div>
  )
}
