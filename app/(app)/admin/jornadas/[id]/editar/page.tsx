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
        const m = (r.match as { id: string; team1_p1_id: string; team1_p2_id: string; team2_p1_id: string; team2_p2_id: string } | null)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    await Promise.all([
      supabase.from('rounds').update({
        scheduled_date: form.scheduled_date,
        court_booker_id: form.court_booker_id || null,
        status: form.status,
      }).eq('id', roundId),

      form.matchId && supabase.from('matches').update({
        team1_p1_id: form.team1_p1_id,
        team1_p2_id: form.team1_p2_id,
        team2_p1_id: form.team2_p1_id,
        team2_p2_id: form.team2_p2_id,
      }).eq('id', form.matchId),
    ])

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
            <option value="played">Jugada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </Field>

        <Field label="Responsable reserva">
          <select value={form.court_booker_id} onChange={e => setForm(f => ({ ...f, court_booker_id: e.target.value }))} style={inputStyle}>
            <option value="">Sin asignar</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        {form.matchId && (
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-4">Parejas</p>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--accent)' }}>Pareja 1</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['team1_p1_id', 'team1_p2_id'] as const).map((key, i) => (
                    <select key={key} value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={inputStyle}>
                      <option value="">{i === 0 ? 'Jugador A' : 'Jugador B'}</option>
                      {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ))}
                </div>
              </div>
              <div className="text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>vs</div>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--orange)' }}>Pareja 2</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['team2_p1_id', 'team2_p2_id'] as const).map((key, i) => (
                    <select key={key} value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={inputStyle}>
                      <option value="">{i === 0 ? 'Jugador C' : 'Jugador D'}</option>
                      {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90 disabled:opacity-40"
          style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}>
          {loading ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
        </button>
      </form>
    </div>
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
