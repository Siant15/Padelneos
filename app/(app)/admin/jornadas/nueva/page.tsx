'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Profile, Season, Round } from '@/lib/types'

export default function NuevaJornadaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [players, setPlayers] = useState<Profile[]>([])
  const [season, setSeason] = useState<Season | null>(null)
  const [lastRoundNum, setLastRoundNum] = useState(0)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    scheduled_date: '',
    court_booker_id: '',
    team1_p1_id: '',
    team1_p2_id: '',
    team2_p1_id: '',
    team2_p2_id: '',
  })

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase.from('seasons').select('*').eq('status', 'active').maybeSingle(),
      supabase.from('rounds').select('round_number').order('round_number', { ascending: false }).limit(1),
    ]).then(([{ data: p }, { data: s }, { data: r }]) => {
      setPlayers((p as Profile[]) ?? [])
      setSeason(s as Season)
      const nextNum = ((r as Round[] | null)?.[0]?.round_number ?? 0) + 1
      setLastRoundNum(nextNum)
    })
  }, [])

  // Cuando se eligen jugadores de equipo 1, auto-asignar los restantes al equipo 2
  const remaining = players.filter(p =>
    p.id !== form.team1_p1_id && p.id !== form.team1_p2_id
  )

  useEffect(() => {
    if (remaining.length === 2 && form.team1_p1_id && form.team1_p2_id) {
      setForm(f => ({
        ...f,
        team2_p1_id: remaining[0]?.id ?? '',
        team2_p2_id: remaining[1]?.id ?? '',
      }))
    }
  }, [form.team1_p1_id, form.team1_p2_id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!season) return
    setLoading(true)

    // Crear la jornada
    const { data: newRound, error: roundError } = await supabase
      .from('rounds')
      .insert({
        season_id: season.id,
        round_number: lastRoundNum,
        scheduled_date: form.scheduled_date,
        court_booker_id: form.court_booker_id || null,
        court_confirmed: false,
        status: 'scheduled',
      })
      .select()
      .single()

    if (roundError || !newRound) {
      setLoading(false)
      alert('Error creando jornada: ' + roundError?.message)
      return
    }

    // Crear el partido (sin resultado todavía)
    const { error: matchError } = await supabase.from('matches').insert({
      round_id: newRound.id,
      team1_p1_id: form.team1_p1_id,
      team1_p2_id: form.team1_p2_id,
      team2_p1_id: form.team2_p1_id,
      team2_p2_id: form.team2_p2_id,
    })

    if (matchError) {
      alert('Jornada creada pero error en partido: ' + matchError.message)
    }

    setLoading(false)
    router.push('/admin')
    router.refresh()
  }

  const allSelected = form.team1_p1_id && form.team1_p2_id && form.team2_p1_id && form.team2_p2_id &&
    form.team1_p1_id !== form.team1_p2_id

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
        <h1 className="text-xl font-bold">Nueva jornada (J{lastRoundNum})</h1>
      </div>

      {!season && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--orange)', color: 'var(--orange)' }}>
          ⚠ Crea primero una temporada activa
        </div>
      )}

      {players.length < 4 && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--orange)', color: 'var(--orange)' }}>
          ⚠ Necesitas al menos 4 jugadores registrados ({players.length}/4)
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Fecha">
          <input type="date" required value={form.scheduled_date}
            onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
            style={inputStyle} />
        </Field>

        <Field label="Responsable de reservar la pista">
          <select value={form.court_booker_id}
            onChange={e => setForm(f => ({ ...f, court_booker_id: e.target.value }))}
            style={inputStyle}>
            <option value="">Sin asignar</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        {/* Parejas */}
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-semibold mb-4">Parejas</p>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--accent)' }}>Pareja 1</p>
              <div className="grid grid-cols-2 gap-2">
                <PlayerSelect
                  value={form.team1_p1_id}
                  onChange={v => setForm(f => ({ ...f, team1_p1_id: v }))}
                  players={players}
                  exclude={[form.team1_p2_id]}
                  label="Jugador A"
                />
                <PlayerSelect
                  value={form.team1_p2_id}
                  onChange={v => setForm(f => ({ ...f, team1_p2_id: v }))}
                  players={players}
                  exclude={[form.team1_p1_id]}
                  label="Jugador B"
                />
              </div>
            </div>

            <div className="text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>vs</div>

            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--orange)' }}>Pareja 2</p>
              <div className="grid grid-cols-2 gap-2">
                <PlayerSelect
                  value={form.team2_p1_id}
                  onChange={v => setForm(f => ({ ...f, team2_p1_id: v }))}
                  players={players}
                  exclude={[form.team1_p1_id, form.team1_p2_id, form.team2_p2_id]}
                  label="Jugador C"
                />
                <PlayerSelect
                  value={form.team2_p2_id}
                  onChange={v => setForm(f => ({ ...f, team2_p2_id: v }))}
                  players={players}
                  exclude={[form.team1_p1_id, form.team1_p2_id, form.team2_p1_id]}
                  label="Jugador D"
                />
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading || !season || !allSelected || !form.scheduled_date}
          className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {loading ? 'Creando...' : 'Crear jornada'}
        </button>
      </form>
    </div>
  )
}

function PlayerSelect({ value, onChange, players, exclude, label }: {
  value: string
  onChange: (v: string) => void
  players: Profile[]
  exclude: string[]
  label: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      <option value="">{label}</option>
      {players.filter(p => !exclude.includes(p.id) || p.id === value).map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
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
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
}
