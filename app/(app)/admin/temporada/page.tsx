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
  const [playedCount, setPlayedCount] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [finishing, setFinishing] = useState(false)

  const [form, setForm] = useState({
    name: `Liga Pádel ${new Date().getFullYear()}`,
    start_date: '',
    day_of_week: 3, // miércoles
    match_time: '20:00',
    min_matches: 9,
  })

  useEffect(() => {
    supabase.from('seasons').select('*').eq('status', 'active').order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (error) {
          setLoadError('No se pudo comprobar si ya existe una liga: ' + error.message)
          return
        }
        const rows = (data as Season[] | null) ?? []
        if (rows.length > 1) {
          setLoadError(`Hay ${rows.length} temporadas activas a la vez (esto no debería pasar). Se está usando la más reciente para editar; contacta para limpiar las duplicadas en la base de datos.`)
        }
        const current = rows[0]
        if (current) {
          setSeason(current)
          setForm({
            name: current.name,
            start_date: current.start_date,
            day_of_week: current.day_of_week ?? 3,
            match_time: current.match_time?.slice(0, 5) ?? '20:00',
            min_matches: current.min_matches,
          })
          const { count } = await supabase
            .from('rounds')
            .select('id', { count: 'exact', head: true })
            .eq('season_id', current.id)
            .eq('status', 'played')
          setPlayedCount(count ?? 0)
        }
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setSaveError('')

    const { error } = season
      ? await supabase.from('seasons').update(form).eq('id', season.id)
      : await supabase.from('seasons').insert({ ...form, status: 'active' })

    setLoading(false)

    if (error) {
      setSaveError('No se pudo guardar la temporada: ' + error.message)
      return
    }

    setSaved(true)
    setTimeout(() => { setSaved(false); router.push('/admin'); router.refresh() }, 1200)
  }

  async function handleFinish() {
    if (!season) return
    if (!confirm('¿Finalizar esta temporada? La clasificación quedará fijada y podrás crear una nueva liga desde cero.')) return
    setFinishing(true)
    setSaveError('')

    const { error } = await supabase.from('seasons').update({ status: 'finished' }).eq('id', season.id)

    setFinishing(false)
    if (error) {
      setSaveError('No se pudo finalizar la temporada: ' + error.message)
      return
    }
    router.push('/admin')
    router.refresh()
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
        <h1 className="text-xl font-bold">{season ? 'Editar temporada' : 'Nueva temporada'}</h1>
      </div>

      {loadError && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>
          ⚠ {loadError}
        </div>
      )}

      {season && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="font-semibold mb-1">📅 Progreso de la temporada</p>
          <p style={{ color: 'var(--text-muted)' }}>{playedCount} de {form.min_matches} jornadas jugadas</p>
        </div>
      )}

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

        {saveError && (
          <p className="text-sm text-center" style={{ color: 'var(--red)' }}>⚠ {saveError}</p>
        )}

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90 disabled:opacity-50"
          style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}>
          {loading ? 'Guardando...' : saved ? '✓ Guardado' : season ? 'Guardar cambios' : 'Crear temporada'}
        </button>
      </form>

      {season && (
        <button
          onClick={handleFinish}
          disabled={finishing}
          className="w-full py-3 rounded-xl font-semibold text-sm transition hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}
        >
          {finishing ? 'Finalizando...' : '🏁 Finalizar temporada y empezar otra'}
        </button>
      )}
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
