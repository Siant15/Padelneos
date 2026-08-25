'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Trophy, User, Settings } from 'lucide-react'

const NAV = [
  { href: '/dashboard', label: 'Inicio', Icon: Home },
  { href: '/liga', label: 'Liga', Icon: Trophy, extraPrefixes: ['/apuestas', '/admin/jornadas'] },
  { href: '/perfil', label: 'Perfil', Icon: User },
]

export default function NavBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const settingsHref = isAdmin ? '/admin' : '/perfil'

  return (
    <>
      {/* Top bar fija — el envoltorio ocupa todo el ancho (fixed con
          left/right en vez de transform, más estable en móvil cuando la
          barra de direcciones del navegador aparece/desaparece al hacer
          scroll); la barra visible de dentro nunca pasa de un ancho de
          móvil, ni siquiera en pantallas grandes. */}
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-center" style={{ background: 'var(--page-bg)' }}>
        <header
          className="w-full max-w-[480px] flex items-center justify-between px-4"
          style={{ height: 52, background: 'var(--surface)', borderBottom: '1px solid var(--tint)' }}
        >
          <span className="font-heading font-extrabold text-[15px] flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" width={26} height={26} className="rounded-lg" />
            PadelNeos
          </span>
          <Link href={settingsHref} aria-label={isAdmin ? 'Administración' : 'Ajustes'} style={{ color: 'var(--text-muted2)' }}>
            <Settings size={20} strokeWidth={2} />
          </Link>
        </header>
      </div>

      {/* Bottom nav fija — mismo patrón que la cabecera */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center" style={{ background: 'var(--page-bg)' }}>
        <nav
          className="w-full max-w-[480px] flex items-stretch"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--tint)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', minHeight: 68 }}
        >
          {NAV.map(({ href, label, Icon, extraPrefixes }) => {
            const active = pathname === href || pathname.startsWith(href + '/') ||
              (extraPrefixes?.some(p => pathname === p || pathname.startsWith(p + '/')) ?? false)
            return (
              <Link
                key={href}
                href={href}
                prefetch
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center justify-center gap-1 flex-1 py-3"
                style={{ color: active ? 'var(--accent)' : 'var(--text-muted2)' }}
              >
                <Icon size={24} strokeWidth={active ? 2.4 : 2} />
                <span className="text-[13px] font-bold text-center leading-tight" style={{ fontFamily: 'var(--font-body)' }}>{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
