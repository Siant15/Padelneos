import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/supabase/server'
import NavBar from '@/components/NavBar'
import WelcomePopup from '@/components/WelcomePopup'
import RotatingAd from '@/components/RotatingAd'
import { todayMadrid } from '@/lib/rounds'
import { ADS, WELCOME_POPUP_UNTIL } from '@/lib/ads'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser()

  if (!user) redirect('/login')

  // Las fechas se deciden aquí, en el servidor, para que no haya desajustes entre servidor y navegador.
  const today = todayMadrid()
  const ads = ADS.filter(a => !a.until || today <= a.until)

  return (
    // overflow-x-hidden aquí (no solo en páginas concretas): un cierre
    // de seguridad para que ninguna fila/botón futuro pueda volver a
    // ensanchar la pantalla, la contengan o no sus propios estilos.
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: 'var(--page-bg)' }}>
      <NavBar />
      <WelcomePopup active={today <= WELCOME_POPUP_UNTIL} />
      <main className="flex-1 w-full mx-auto max-w-[480px] min-w-0" style={{ paddingTop: 52, paddingBottom: 80 }}>
        {children}
        <RotatingAd ads={ads} />
      </main>
    </div>
  )
}
