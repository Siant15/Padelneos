import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import NavBar from '@/components/NavBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser()

  if (!user) redirect('/login')

  return (
    // overflow-x-hidden aquí (no solo en páginas concretas): un cierre
    // de seguridad para que ninguna fila/botón futuro pueda volver a
    // ensanchar la pantalla, la contengan o no sus propios estilos.
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: 'var(--page-bg)' }}>
      <NavBar isAdmin={isAdminUser(user)} />
      <main className="flex-1 w-full mx-auto max-w-[480px] min-w-0" style={{ paddingTop: 52, paddingBottom: 80 }}>
        {children}
      </main>
    </div>
  )
}
