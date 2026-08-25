import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const supabaseOrigin = 'https://ghxwjbwvgestdvhjqqsl.supabase.co'

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${supabaseOrigin}`,
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin} wss://ghxwjbwvgestdvhjqqsl.supabase.co`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // El proxy ya valida la sesión contra Supabase Auth en CADA
  // navegación (obligatorio, es lo único que puede bloquear el acceso
  // antes de renderizar nada) — sin esto, cada layout/página volvía a
  // llamar a getUser() por su cuenta y repetía esa misma validación de
  // red una segunda vez en cada cambio de pestaña. Se pasa el
  // resultado ya validado por cabecera para que el resto de la app lo
  // lea gratis con headers() en vez de perder otra vuelta de red.
  requestHeaders.set('x-user-id', user?.id ?? '')
  requestHeaders.set('x-user-email', user?.email ?? '')

  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
  // /reset-password llega con un token de recuperación en la URL que solo el
  // cliente puede procesar (establece la sesión tras cargar la página); si el
  // proxy la bloquea por falta de sesión de servidor, el enlace del email nunca funciona.
  // /api/cron/* lo llama el cron de Vercel sin sesión de usuario; se
  // autoriza a sí mismo comprobando CRON_SECRET dentro de la propia ruta.
  // /api/signup lo llama alguien que TODAVÍA no tiene cuenta (por
  // definición no puede haber sesión); se autoriza con el código de
  // invitación dentro de la propia ruta.
  const isPublicPath = request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/reset-password' ||
    request.nextUrl.pathname.startsWith('/api/cron/') || request.nextUrl.pathname === '/api/signup'

  if (!user && !isAuthPage && !isPublicPath) {
    const redirect = NextResponse.redirect(new URL('/login', request.url))
    redirect.headers.set('Content-Security-Policy', csp)
    return redirect
  }

  if (user && isAuthPage) {
    const redirect = NextResponse.redirect(new URL('/dashboard', request.url))
    redirect.headers.set('Content-Security-Policy', csp)
    return redirect
  }

  // supabaseResponse pudo construirse (dentro de setAll, al refrescar el
  // token) antes de fijar las cabeceras de arriba, y NextResponse.next()
  // congela las cabeceras de la request en el momento en que se llama —
  // por eso se reconstruye aquí con las cabeceras finales, copiando
  // cualquier cookie de sesión que se haya refrescado mientras tanto.
  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } })
  for (const cookie of supabaseResponse.cookies.getAll()) {
    finalResponse.cookies.set(cookie)
  }
  finalResponse.headers.set('Content-Security-Policy', csp)
  return finalResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
