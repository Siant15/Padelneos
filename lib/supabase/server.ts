import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
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

// proxy.ts ya valida la sesión contra Supabase Auth en cada navegación
// (es lo único que puede bloquear el acceso antes de renderizar nada) y
// deja el resultado en cabeceras (x-user-id/x-user-email). Antes,
// layout.tsx y cada página volvían a llamar a supabase.auth.getUser()
// por su cuenta, repitiendo esa misma validación de red una segunda vez
// en cada cambio de pestaña — de ahí la lentitud al navegar. Leer la
// cabecera es gratis: nada que el cliente mande puede falsificarla,
// porque el proxy siempre la sobrescribe con su propio resultado
// (Headers.set reemplaza cualquier valor previo del mismo nombre).
export const getCachedUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  const h = await headers()
  const id = h.get('x-user-id')
  if (!id) return null
  return { id, email: h.get('x-user-email') || null }
})
