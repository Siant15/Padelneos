import { createClient } from '@/lib/supabase/server'
import type { Round, Season, Profile } from '@/lib/types'
import { formatDate, HAND_LABELS, SIDE_LABELS } from '@/lib/types'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createClient()

  const [{ data: seasons }, { data: rounds }, { data: players }] = await Promise.all([
    supabase.from('seasons').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(1),
    supabase.from('rounds').select('*, match:matches(id, winner)').order('round_number').limit(20),
    supabase.from('profiles').select('*').order('created_at'),
  ])
  const season = seasons?.[0] as Season | undefined

  const playerCount = players?.length ?? 0

  return (
    <div className="px-5 pt-5 pb-6 flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[22px] font-extrabold">🎾 Gestión de la liga</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Cualquier jugador puede crear la liga, las jornadas y los mercados desde aquí.
        </p>
      </div>

      {/* Jugadores registrados */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="font-heading text-sm font-bold">👥 Jugadores registrados</h2>
          <span
            className="text-xs font-extrabold px-2.5 py-1 rounded-full"
            style={{ background: playerCount >= 4 ? 'var(--green-bg)' : 'var(--orange-bg)', color: playerCount >= 4 ? 'var(--green)' : 'var(--orange)' }}
          >
            {playerCount}/4
          </span>
        </div>
        {!players?.length ? (
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            Nadie se ha registrado todavía. Comparte el enlace de la app con tus amigos.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {(players as Profile[]).map(p => (
              <div key={p.id} className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
                <p className="font-bold text-sm">{p.name}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <Tag>{p.racket_brand ? `🎾 ${p.racket_brand}` : '🎾 Sin pala'}</Tag>
                  <Tag>{p.dominant_hand ? `✋ ${HAND_LABELS[p.dominant_hand]}` : '✋ Sin definir'}</Tag>
                  <Tag>{p.preferred_side ? `↔️ ${SIDE_LABELS[p.preferred_side]}` : '↔️ Sin definir'}</Tag>
                </div>
              </div>
            ))}
          </div>
        )}
        {playerCount < 4 && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Necesitas 4 jugadores registrados para crear jornadas.
          </p>
        )}
      </section>

      {/* Temporada */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="font-heading text-sm font-bold">🎾 Temporada</h2>
          <Link
            href="/admin/temporada"
            className="text-xs px-3 py-1.5 rounded-xl font-bold"
            style={{ background: season ? 'var(--tint)' : 'var(--accent)', color: season ? '#555' : '#fff' }}
          >
            {season ? 'Editar' : '+ Crear liga'}
          </Link>
        </div>
        {season ? (
          <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            <p className="font-bold text-sm">{(season as Season).name}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Desde {formatDate((season as Season).start_date)}
              {(season as Season).match_time && ` · ${(season as Season).match_time?.slice(0, 5)}`}
            </p>
          </div>
        ) : (
          <Link
            href="/admin/temporada"
            className="block rounded-2xl p-4 text-center"
            style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}
          >
            <p className="font-heading font-bold text-sm">⚡ Aún no has creado la liga</p>
            <p className="text-xs mt-1">Toca aquí para decidir fecha de inicio, día de la semana y hora fija.</p>
          </Link>
        )}
      </section>

      {/* Jornadas */}
      {season && (
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="font-heading text-sm font-bold">📅 Jornadas</h2>
            <Link
              href="/admin/jornadas/nueva"
              className="text-xs px-3 py-1.5 rounded-xl font-bold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              + Nueva jornada
            </Link>
          </div>
          {!(rounds as Round[] | null)?.length ? (
            <div className="rounded-2xl p-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
              No hay jornadas creadas. Crea la primera para empezar la liga.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {(rounds as Round[]).map(r => (
                <div key={r.id} className="rounded-2xl p-3.5 flex items-center justify-between" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
                  <div>
                    <span className="font-bold text-sm">J{r.round_number}</span>
                    <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(r.scheduled_date)}
                    </span>
                    <span className="ml-2 text-xs font-bold" style={{
                      color: r.status === 'played' ? 'var(--green)' : r.status === 'cancelled' ? 'var(--red)' : 'var(--text-muted2)'
                    }}>
                      {r.status === 'played' ? '✓ Jugada' : r.status === 'cancelled' ? 'Cancelada' : 'Programada'}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Link href={`/admin/jornadas/${r.id}/editar`} className="text-xs px-2 py-1.5 rounded-lg font-bold" style={{ background: 'var(--tint)', color: '#555' }}>Editar</Link>
                    <Link href={`/admin/jornadas/${r.id}/resultado`} className="text-xs px-2 py-1.5 rounded-lg font-bold" style={{ background: 'var(--tint)', color: '#555' }}>Resultado</Link>
                    <Link href={`/admin/jornadas/${r.id}/mercados`} className="text-xs px-2 py-1.5 rounded-lg font-bold" style={{ background: 'var(--surface2)', color: 'var(--accent)' }}>🎰</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
      {children}
    </span>
  )
}
