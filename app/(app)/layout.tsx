import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NavBar from '@/components/NavBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--page-bg)' }}>
      <NavBar />
      <main className="flex-1 w-full mx-auto max-w-2xl" style={{ paddingTop: 52, paddingBottom: 80 }}>
        {children}
      </main>
    </div>
  )
}
