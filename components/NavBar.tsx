'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

const NAV = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/liga', label: 'Liga', icon: '🎾', extraPrefixes: ['/apuestas', '/admin'] },
  { href: '/perfil', label: 'Perfil', icon: '🙋' },
]

export default function NavBar({ userId }: { userId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Top bar fija */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4"
        style={{ height: 52, background: 'var(--surface)', borderBottom: '1px solid var(--tint)' }}
      >
        <span className="font-heading font-extrabold text-[15px] flex items-center gap-1.5">🎾 Liga Pádel</span>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Menú de gestión de la liga"
            aria-expanded={menuOpen}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{ background: 'var(--tint)', color: 'var(--text-muted)' }}
          >
            ⚙️
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 mt-2 rounded-xl overflow-hidden shadow-md"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', minWidth: 170 }}
            >
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm font-semibold"
                style={{ color: 'var(--text)', borderBottom: '1px solid var(--hairline)' }}
              >
                🎾 Gestión de la liga
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold"
                style={{ color: 'var(--red)' }}
              >
                Salir
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Bottom nav fija */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--tint)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {NAV.map(({ href, label, icon, extraPrefixes }) => {
          const active = pathname === href || pathname.startsWith(href + '/') ||
            (extraPrefixes?.some(p => pathname === p || pathname.startsWith(p + '/')) ?? false)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center gap-0.5 flex-1 py-2"
              style={{ color: active ? 'var(--accent)' : 'var(--text-muted2)' }}
            >
              <span className="text-lg">{icon}</span>
              <span className="text-[11px] font-bold text-center leading-tight" style={{ fontFamily: 'var(--font-body)' }}>{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
