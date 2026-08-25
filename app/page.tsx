import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/supabase/server'

export default async function Home() {
  const user = await getCachedUser()

  if (user) redirect('/dashboard')
  else redirect('/login')
}
