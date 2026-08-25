import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import NavBar from '@/components/NavBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--page-bg)' }}>
      <NavBar isAdmin={isAdminUser(user)} />
      <main className="flex-1 w-full mx-auto max-w-[480px]" style={{ paddingTop: 52, paddingBottom: 80 }}>
        {children}
      </main>
    </div>
  )
}
