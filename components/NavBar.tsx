'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/liga', label: 'Liga', icon: '🎾', extraPrefixes: ['/apuestas', '/admin'] },
  { href: '/perfil', label: 'Perfil', icon: '🙋' },
]

export default function NavBar() {
  const pathname = usePathname()

  return (
    <>
      {/* Top bar fija */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-center px-4"
        style={{ height: 52, background: 'var(--surface)', borderBottom: '1px solid var(--tint)' }}
      >
        <span className="font-heading font-extrabold text-[15px] flex items-center gap-1.5">🎾 Liga Pádel</span>
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
