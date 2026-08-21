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

  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
  // /reset-password llega con un token de recuperación en la URL que solo el
  // cliente puede procesar (establece la sesión tras cargar la página); si el
  // proxy la bloquea por falta de sesión de servidor, el enlace del email nunca funciona.
  // /api/cron/* lo llama el cron de Vercel sin sesión de usuario; se
  // autoriza a sí mismo comprobando CRON_SECRET dentro de la propia ruta.
  const isPublicPath = request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/reset-password' ||
    request.nextUrl.pathname.startsWith('/api/cron/')

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

  supabaseResponse.headers.set('Content-Security-Policy', csp)
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
