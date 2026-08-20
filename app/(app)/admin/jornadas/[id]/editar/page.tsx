'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import type { Profile } from '@/lib/types'

export default function EditarJornadaPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const roundId = params.id as string

  const [players, setPlayers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [hasResult, setHasResult] = useState(false)

  const [form, setForm] = useState({
    scheduled_date: '',
    court_booker_id: '',
    status: 'scheduled',
    team1_p1_id: '',
    team1_p2_id: '',
    team2_p1_id: '',
    team2_p2_id: '',
    matchId: '',
  })

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase.from('rounds').select('*, match:matches(*)').eq('id', roundId).single(),
    ]).then(([{ data: p }, { data: r }]) => {
      setPlayers((p as Profile[]) ?? [])
      if (r) {
        const m = (r.match as { id: string; team1_p1_id: string; team1_p2_id: string; team2_p1_id: string; team2_p2_id: string; winner: string | null } | null)
        setHasResult(!!m?.winner)
        setForm({
          scheduled_date: r.scheduled_date,
          court_booker_id: r.court_booker_id ?? '',
          status: r.status,
          team1_p1_id: m?.team1_p1_id ?? '',
          team1_p2_id: m?.team1_p2_id ?? '',
          team2_p1_id: m?.team2_p1_id ?? '',
          team2_p2_id: m?.team2_p2_id ?? '',
          matchId: m?.id ?? '',
        })
      }
    })
  }, [roundId])

  const pairIds = [form.team1_p1_id, form.team1_p2_id, form.team2_p1_id, form.team2_p2_id].filter(Boolean)
  const hasDuplicatePlayers = new Set(pairIds).size !== pairIds.length
  const allPairsSelected = pairIds.length === 4

  const blockedPlayedWithoutResult = form.status === 'played' && !hasResult
  const blockedRevertWithResult = hasResult && form.status !== 'played'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (hasDuplicatePlayers || blockedPlayedWithoutResult || blockedRevertWithResult) return
    setLoading(true)
    setSaveError('')

    const { error: roundError } = await supabase.from('rounds').update({
      scheduled_date: form.scheduled_date,
      court_booker_id: form.court_booker_id || null,
      status: form.status,
    }).eq('id', roundId)

    if (roundError) {
      setSaveError('No se pudo guardar la jornada: ' + roundError.message)
      setLoading(false)
      return
    }

    if (form.matchId) {
      const { error: matchError } = await supabase.from('matches').update({
        team1_p1_id: form.team1_p1_id,
        team1_p2_id: form.team1_p2_id,
        team2_p1_id: form.team2_p1_id,
        team2_p2_id: form.team2_p2_id,
      }).eq('id', form.matchId)

      if (matchError) {
        setSaveError('Jornada guardada, pero las parejas fallaron: ' + matchError.message)
        setLoading(false)
        return
      }
    } else if (allPairsSelected) {
      const { data: newMatch, error: matchError } = await supabase.from('matches').insert({
        round_id: roundId,
        team1_p1_id: form.team1_p1_id,
        team1_p2_id: form.team1_p2_id,
        team2_p1_id: form.team2_p1_id,
        team2_p2_id: form.team2_p2_id,
      }).select().single()

      if (matchError) {
        setSaveError('Jornada guardada, pero las parejas fallaron: ' + matchError.message)
        setLoading(false)
        return
      }
      if (newMatch) setForm(f => ({ ...f, matchId: newMatch.id }))
    }

    setSaved(true)
    setLoading(false)
    setTimeout(() => { setSaved(false); router.push('/admin'); router.refresh() }, 1500)
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
        <h1 className="text-xl font-bold">Editar jornada</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Fecha">
          <input type="date" required value={form.scheduled_date}
            onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
            style={inputStyle} />
        </Field>

        <Field label="Estado">
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
            <option value="scheduled">Programada</option>
            <option value="played" disabled={!hasResult}>Jugada{!hasResult ? ' (falta registrar resultado)' : ''}</option>
            <option value="cancelled">Cancelada</option>
          </select>
          {blockedPlayedWithoutResult && (
            <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>
              ⚠ No puedes marcarla como jugada sin haber registrado el resultado del partido.
            </p>
          )}
          {blockedRevertWithResult && (
            <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>
              ⚠ Esta jornada ya tiene un resultado registrado, no puedes quitarle el estado &quot;Jugada&quot;.
            </p>
          )}
        </Field>

        <Field label="Responsable reserva">
          <select value={form.court_booker_id} onChange={e => setForm(f => ({ ...f, court_booker_id: e.target.value }))} style={inputStyle}>
            <option value="">Sin asignar</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-4">Parejas</p>
            {!form.matchId && (
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Esta jornada todavía no tiene parejas asignadas. Elige los 4 jugadores y guarda para crear el partido.
              </p>
            )}
            {hasResult && (
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                🔒 Este partido ya tiene un resultado registrado. Para cambiar las parejas, borra antes el resultado.
              </p>
            )}
            <fieldset disabled={hasResult} className="space-y-4">
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--accent)' }}>Pareja 1</p>
                <div className="grid grid-cols-2 gap-2">
                  <PlayerSelect
                    value={form.team1_p1_id}
                    onChange={v => setForm(f => ({ ...f, team1_p1_id: v }))}
                    players={players}
                    exclude={[form.team1_p2_id, form.team2_p1_id, form.team2_p2_id]}
                    label="Jugador A"
                  />
                  <PlayerSelect
                    value={form.team1_p2_id}
                    onChange={v => setForm(f => ({ ...f, team1_p2_id: v }))}
                    players={players}
                    exclude={[form.team1_p1_id, form.team2_p1_id, form.team2_p2_id]}
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
            </fieldset>
            {hasDuplicatePlayers && (
              <p className="text-xs mt-3" style={{ color: 'var(--red)' }}>
                ⚠ Un jugador no puede estar en las dos parejas a la vez.
              </p>
            )}
        </div>

        {saveError && (
          <p className="text-sm text-center" style={{ color: 'var(--red)' }}>⚠ {saveError}</p>
        )}

        <button type="submit" disabled={loading || hasDuplicatePlayers || blockedPlayedWithoutResult || blockedRevertWithResult}
          className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90 disabled:opacity-40"
          style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}>
          {loading ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
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
