'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import JornadasAccordion, { type JornadaViewModel } from '@/components/JornadasAccordion'
import MiniCalendar from '@/components/MiniCalendar'
import { revalidateLigaData } from '@/lib/actions'

type PlayerLite = { id: string; name: string }

type ActiveSeasonInfo = {
  id: string
  name: string
  minMatches: number
}

type Action = null | 'extend' | 'new'

export default function CalendarioTab({
  activeSeason,
  players,
  items,
  isLeagueComplete,
}: {
  activeSeason: ActiveSeasonInfo | null
  players: PlayerLite[]
  items: JornadaViewModel[]
  isLeagueComplete: boolean
}) {
  const [action, setAction] = useState<Action>(null)

  if (!activeSeason) {
    return <SeasonForm mode="create" players={players} onCancel={null} />
  }

  return (
    <div className="flex flex-col gap-3.5">
      {!!items.length && <MiniCalendar matchDates={items.map(j => j.rawDate).filter((d): d is string => !!d)} />}
      {!items.length
        ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No hay jornadas creadas todavía.</p>
        : <JornadasAccordion items={items} />}

      {action === null && (
        isLeagueComplete ? (
          <div className="rounded-2xl p-4 flex flex-col gap-2.5" style={{ background: 'var(--surface2)' }}>
            <p className="font-heading font-bold text-sm">🏁 Final previsto de la liga — J{activeSeason.minMatches}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setAction('extend')}
                className="flex-1 text-center text-xs font-bold py-2.5 rounded-xl transition hover:opacity-90"
                style={{ background: 'var(--tint)', color: '#555' }}
              >
                Alargar esta liga
              </button>
              <button
                onClick={() => setAction('new')}
                className="flex-1 text-center text-xs font-bold py-2.5 rounded-xl transition hover:opacity-90"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Empezar nueva liga
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface2)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Liga de {activeSeason.minMatches} partidos · termina en J{activeSeason.minMatches}
            </span>
            <button
              onClick={() => setAction('extend')}
              className="text-xs font-bold px-3 py-1.5 rounded-xl transition hover:opacity-90"
              style={{ background: 'var(--tint)', color: '#555' }}
            >
              Ampliar calendario
            </button>
          </div>
        )
      )}

      {action === 'extend' && (
        <ExtendForm currentMin={activeSeason.minMatches} onCancel={() => setAction(null)} />
      )}

      {action === 'new' && (
        <SeasonForm mode="new" players={players} onCancel={() => setAction(null)} />
      )}

      <Link href="/liga/historico" className="text-xs font-bold text-center" style={{ color: 'var(--text-muted)' }}>
        📜 Ver ligas finalizadas →
      </Link>
    </div>
  )
}

// ─── Crear liga (sin temporada activa, o tras terminar la anterior) ──
function SeasonForm({ mode, players, onCancel }: {
  mode: 'create' | 'new'
  players: PlayerLite[]
  onCancel: (() => void) | null
}) {
  const supabase = createClient()
  const router = useRouter()
  const [name, setName] = useState(`Liga Pádel ${new Date().getFullYear()}`)
  const [minMatches, setMinMatches] = useState(9)
  const [firstMatchDate, setFirstMatchDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const playersReady = players.length === 4

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!playersReady || minMatches < 1) return
    setLoading(true)
    setError('')

    const { error: rpcError } = await supabase.rpc('start_new_season', {
      p_name: name.trim(),
      p_min_matches: minMatches,
      p_first_match_date: firstMatchDate || null,
    })

    setLoading(false)
    if (rpcError) {
      setError('No se pudo crear la liga: ' + rpcError.message)
      return
    }
    await revalidateLigaData()
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div>
        <p className="font-heading font-bold text-sm">
          {mode === 'create' ? '🎾 Todavía no hay liga activa' : '🎾 Nueva liga'}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {mode === 'create'
            ? 'Configúrala aquí para generar el calendario.'
            : 'La liga anterior queda cerrada y disponible como histórico.'}
        </p>
      </div>

      <Field label="Nombre de la liga">
        <input type="text" required value={name}
          onChange={e => setName(e.target.value)}
          style={inputStyle} />
      </Field>

      <Field label="Número total de partidos">
        <input type="number" min={1} max={30} required value={minMatches}
          onChange={e => setMinMatches(+e.target.value)}
          style={inputStyle} />
      </Field>

      <Field label="Fecha del primer partido (opcional)">
        <input type="date" value={firstMatchDate}
          onChange={e => setFirstMatchDate(e.target.value)}
          style={inputStyle} />
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Si la pones, el resto de jornadas se rellenan solas cada 7 días (J2, J3...). Se puede ajustar cualquiera después desde Editar jornada.
        </p>
      </Field>

      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Jugadores</p>
        {playersReady ? (
          <div className="flex flex-wrap gap-1.5">
            {players.map(p => (
              <span key={p.id} className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--tint)', color: '#555' }}>
                {p.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--orange)' }}>
            ⚠ Se necesitan exactamente 4 jugadores registrados (ahora hay {players.length}).
          </p>
        )}
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl font-semibold text-sm" style={{ background: 'var(--tint)', color: '#555' }}>
            Cancelar
          </button>
        )}
        <button type="submit" disabled={loading || !playersReady}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {loading ? 'Creando...' : 'Crear liga y generar calendario'}
        </button>
      </div>
    </form>
  )
}

// ─── Ampliar la liga activa ───────────────────────────────────
function ExtendForm({ currentMin, onCancel }: { currentMin: number; onCancel: () => void }) {
  const supabase = createClient()
  const router = useRouter()
  const [newMin, setNewMin] = useState(currentMin + 3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newMin <= currentMin) return
    setLoading(true)
    setError('')

    const { error: rpcError } = await supabase.rpc('extend_active_season', { p_new_min_matches: newMin })

    setLoading(false)
    if (rpcError) {
      setError('No se pudo ampliar el calendario: ' + rpcError.message)
      return
    }
    await revalidateLigaData()
    onCancel()
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <Field label={`Nuevo total de partidos (ahora ${currentMin})`}>
        <input type="number" min={currentMin + 1} max={60} required value={newMin}
          onChange={e => setNewMin(+e.target.value)}
          style={inputStyle} />
      </Field>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Se añadirán J{currentMin + 1}–J{newMin > currentMin ? newMin : currentMin + 1}, siguiendo la rotación de parejas y de responsable justo donde se quedó. Se recomienda ampliar de 3 en 3 para mantener los emparejamientos equilibrados, pero puedes poner cualquier cantidad.
      </p>

      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl font-semibold text-sm" style={{ background: 'var(--tint)', color: '#555' }}>
          Cancelar
        </button>
        <button type="submit" disabled={loading || newMin <= currentMin}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {loading ? 'Ampliando...' : `Ampliar a ${newMin} partidos`}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
}
