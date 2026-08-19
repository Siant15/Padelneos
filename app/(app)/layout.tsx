import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NavBar from '@/components/NavBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--page-bg)' }}>
      <NavBar userId={user.id} />
      <main className="flex-1 max-w-2xl w-full mx-auto">
        {children}
      </main>
    </div>
  )
}
