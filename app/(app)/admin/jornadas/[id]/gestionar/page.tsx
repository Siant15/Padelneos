import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCachedUser } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { getRoundAdminData } from '@/lib/admin-actions'
import GestionarJornada from './GestionarJornada'

// Gestión completa de una jornada: solo el administrador. Todo lo operativo
// (reserva, parejas, resultado, preguntas y apuestas, liquidación) se puede
// registrar o corregir desde aquí, también cuando la jornada ya está cerrada.
export default async function GestionarJornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCachedUser()
  if (!isAdminUser(user)) redirect('/dashboard')

  const { id } = await params
  const data = await getRoundAdminData(id)

  if (!data) {
    return (
      <div className="space-y-4">
        <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Administración</Link>
        <p className="text-sm">No se encontró la jornada.</p>
      </div>
    )
  }

  // La clave cambia con los datos: al refrescar tras un cambio, los formularios
  // se reinician con lo que de verdad hay guardado.
  return <GestionarJornada key={JSON.stringify(data)} data={data} />
}
