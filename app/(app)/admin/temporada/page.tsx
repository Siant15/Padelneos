'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Season } from '@/lib/types'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export default function TemporadaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [season, setSeason] = useState<Season | null>(null)

  const [form, setForm] = useState({
    name: 'Liga Pádel 2025',
    start_date: '',
    day_of_week: 3, // miércoles
    match_time: '20:00',
    min_matches: 9,
  })

  useEffect(() => {
    supabase.from('seasons').select('*').eq('status', 'active').maybeSingle().then(({ data }) => {
      if (data) {
        setSeason(data as Season)
        setForm({
          name: data.name,
          start_date: data.start_date,
          day_of_week: data.day_of_week ?? 3,
          match_time: data.match_time?.slice(0, 5) ?? '20:00',
          min_matches: data.min_matches,
        })
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    if (season) {
      await supabase.from('seasons').update(form).eq('id', season.id)
    } else {
      await supabase.from('seasons').insert({ ...form, status: 'active' })
    }

    setSaved(true)
    setLoading(false)
    setTimeout(() => { setSaved(false); router.push('/admin') }, 1500)
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
        <h1 className="text-xl font-bold">{season ? 'Editar temporada' : 'Nueva temporada'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre de la liga">
          <input type="text" required value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="input-field" style={inputStyle} />
        </Field>

        <Field label="Fecha de inicio">
          <input type="date" required value={form.start_date}
            onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            style={inputStyle} />
        </Field>

        <Field label="Día de la semana habitual">
          <select value={form.day_of_week}
            onChange={e => setForm(f => ({ ...f, day_of_week: +e.target.value }))}
            style={inputStyle}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>

        <Field label="Hora habitual">
          <input type="time" value={form.match_time}
            onChange={e => setForm(f => ({ ...f, match_time: e.target.value }))}
            style={inputStyle} />
        </Field>

        <Field label="Mínimo de partidos">
          <input type="number" min={1} max={30} value={form.min_matches}
            onChange={e => setForm(f => ({ ...f, min_matches: +e.target.value }))}
            style={inputStyle} />
        </Field>

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90 disabled:opacity-50"
          style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}>
          {loading ? 'Guardando...' : saved ? '✓ Guardado' : season ? 'Guardar cambios' : 'Crear temporada'}
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
