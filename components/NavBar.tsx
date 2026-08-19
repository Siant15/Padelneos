'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

const NAV = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/jornadas', label: 'Calendario', icon: '📅' },
  { href: '/clasificacion', label: 'Clasificación', icon: '🏆' },
  { href: '/apuestas', label: 'Apuestas', icon: '💰' },
  { href: '/perfil', label: 'Mi perfil', icon: '🙋' },
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
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--tint)' }}
      >
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 flex-1 py-2"
              style={{ color: active ? 'var(--accent)' : '#B0B0AA' }}
            >
              <span className="text-lg">{icon}</span>
              <span className="text-[9px] font-bold text-center leading-tight" style={{ fontFamily: 'var(--font-body)' }}>{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
