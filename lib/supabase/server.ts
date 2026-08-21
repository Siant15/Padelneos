import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

// Memoizado por request (React cache()): el layout y la página que
// renderiza dentro de la misma petición reciben el MISMO cliente en vez
// de crear uno nuevo cada uno — así una llamada posterior a getCachedUser
// no repite la validación de sesión contra Supabase Auth.
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
})

// Un único punto de validación de la sesión por request — se cachea con
// createClient(), así que layout.tsx, la página y cualquier query
// posterior que llame a esta función reutilizan la misma comprobación.
export const getCachedUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
