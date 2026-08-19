import { createClient } from '@/lib/supabase/server'
import type { Round, Season } from '@/lib/types'
import { formatDate } from '@/lib/types'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createClient()

  const [{ data: season }, { data: rounds }] = await Promise.all([
    supabase.from('seasons').select('*').eq('status', 'active').maybeSingle(),
    supabase.from('rounds').select('*, match:matches(id, winner)').order('round_number').limit(20),
  ])

  return (
    <div className="space-y-6 pb-4">
      <h1 className="text-xl font-bold">⚙️ Admin</h1>

      {/* Temporada */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Temporada activa</h2>
          <Link href="/admin/temporada" className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            {season ? 'Editar' : '+ Crear'}
          </Link>
        </div>
        {season ? (
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="font-semibold">{(season as Season).name}</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Desde {formatDate((season as Season).start_date)}
              {(season as Season).match_time && ` · ${(season as Season).match_time?.slice(0, 5)}`}
            </p>
          </div>
        ) : (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            No hay temporada activa. Crea una primero.
          </div>
        )}
      </section>

      {/* Jornadas */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Jornadas</h2>
          {season && (
            <Link href="/admin/jornadas/nueva" className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              + Nueva jornada
            </Link>
          )}
        </div>
        {!(rounds as Round[] | null)?.length ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No hay jornadas creadas.</p>
        ) : (
          <div className="space-y-2">
            {(rounds as Round[]).map(r => (
              <div key={r.id} className="rounded-xl p-4 flex items-center justify-between"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div>
                  <span className="font-semibold">J{r.round_number}</span>
                  <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(r.scheduled_date)}
                  </span>
                  <span className="ml-2 text-xs" style={{
                    color: r.status === 'played' ? 'var(--green)' : r.status === 'cancelled' ? 'var(--red)' : 'var(--text-muted)'
                  }}>
                    {r.status === 'played' ? '✓ Jugada' : r.status === 'cancelled' ? 'Cancelada' : 'Programada'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/jornadas/${r.id}/editar`}
                    className="text-xs px-2 py-1.5 rounded-lg"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    Editar
                  </Link>
                  <Link href={`/admin/jornadas/${r.id}/resultado`}
                    className="text-xs px-2 py-1.5 rounded-lg"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    Resultado
                  </Link>
                  <Link href={`/admin/jornadas/${r.id}/mercados`}
                    className="text-xs px-2 py-1.5 rounded-lg"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                    🎰
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
