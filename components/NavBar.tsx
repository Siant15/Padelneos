'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/jornadas', label: 'Jornadas', icon: '📅' },
  { href: '/clasificacion', label: 'Liga', icon: '🏆' },
  { href: '/estadisticas', label: 'Stats', icon: '📊' },
  { href: '/apuestas', label: 'Apuestas', icon: '🎰' },
  { href: '/admin', label: 'Admin', icon: '⚙️' },
]

export default function NavBar({ userId }: { userId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Top bar */}
      <header
        className="sticky top-0 z-50 px-4 py-3 flex items-center justify-between"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <span className="font-bold text-lg">🎾 Liga Pádel</span>
        <button
          onClick={handleLogout}
          className="text-xs px-3 py-1.5 rounded-lg transition hover:opacity-80"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          Salir
        </button>
      </header>

      {/* Bottom nav (mobile-first) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
      >
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition"
              style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <span className="text-xl">{icon}</span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Spacer para el nav bottom */}
      <div className="h-16" />
    </>
  )
}
