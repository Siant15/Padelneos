'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Season, Profile } from '@/lib/types'
import { getSeasonCalendar, getSeasonMatchDate, formatDate } from '@/lib/types'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export default function TemporadaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [season, setSeason] = useState<Season | null>(null)
  const [playedCount, setPlayedCount] = useState(0)
  const [existingRoundNumbers, setExistingRoundNumbers] = useState<number[]>([])
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [generateOk, setGenerateOk] = useState(false)

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

          const { data: existingRounds } = await supabase
            .from('rounds')
            .select('round_number')
            .eq('season_id', current.id)
          setExistingRoundNumbers((existingRounds ?? []).map(r => r.round_number))
        }
      })
  }, [])

  async function handleGenerateRounds() {
    if (!season) return
    setGenerating(true)
    setGenerateError('')
    setGenerateOk(false)

    const { data: players, error: playersError } = await supabase.from('profiles').select('*').order('created_at')
    if (playersError || !players?.length) {
      setGenerateError('No se pudieron cargar los jugadores: ' + (playersError?.message ?? 'sin jugadores registrados'))
      setGenerating(false)
      return
    }

    const missing = Array.from({ length: form.min_matches }, (_, i) => i + 1)
      .filter(n => !existingRoundNumbers.includes(n))

    if (!missing.length) {
      setGenerateError('Ya están creadas todas las jornadas de la temporada.')
      setGenerating(false)
      return
    }

    const rows = missing.map(n => ({
      season_id: season.id,
      round_number: n,
      scheduled_date: getSeasonMatchDate(form.start_date, n),
      court_booker_id: (players as Profile[])[(n - 1) % players.length].id,
      court_confirmed: false,
      status: 'scheduled',
    }))

    const { error } = await supabase.from('rounds').insert(rows)
    setGenerating(false)
    if (error) {
      setGenerateError('No se pudieron crear las jornadas: ' + error.message)
      return
    }

    setExistingRoundNumbers(prev => [...prev, ...missing])
    setGenerateOk(true)
    setTimeout(() => setGenerateOk(false), 3000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setSaveError('')

    const startDateChanged = !!season && season.start_date !== form.start_date

    const { error } = season
      ? await supabase.from('seasons').update(form).eq('id', season.id)
      : await supabase.from('seasons').insert({ ...form, status: 'active' })

    if (error) {
      setLoading(false)
      setSaveError('No se pudo guardar la temporada: ' + error.message)
      return
    }

    // Si cambia la fecha de inicio, recalculamos la fecha de las jornadas
    // ya generadas que todavía no se han jugado (las jugadas se respetan).
    if (season && startDateChanged) {
      const { data: pendingRounds, error: roundsError } = await supabase
        .from('rounds')
        .select('id, round_number')
        .eq('season_id', season.id)
        .eq('status', 'scheduled')

      if (roundsError) {
        setLoading(false)
        setSaveError('La temporada se guardó, pero no se pudieron actualizar las fechas de las jornadas: ' + roundsError.message)
        return
      }

      const updates = (pendingRounds ?? []).map(r =>
        supabase.from('rounds').update({ scheduled_date: getSeasonMatchDate(form.start_date, r.round_number) }).eq('id', r.id)
      )
      const results = await Promise.all(updates)
      const failed = results.find(r => r.error)
      if (failed?.error) {
        setLoading(false)
        setSaveError('La temporada se guardó, pero alguna jornada no se pudo reprogramar: ' + failed.error.message)
        return
      }
    }

    setLoading(false)

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

      {form.start_date && form.min_matches > 0 && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="font-semibold mb-1">🗓️ Calendario propuesto</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            {form.min_matches} partidos: se juega 3 semanas seguidas y se descansa 1.
          </p>
          <div className="flex flex-col gap-1">
            {getSeasonCalendar(form.start_date, form.min_matches).map(w => (
              <div key={w.week} className="flex items-center justify-between py-1 text-xs" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Semana {w.week} · {formatDate(w.date)}</span>
                {w.matchIndex ? (
                  <span className="font-bold" style={{ color: 'var(--accent)' }}>J{w.matchIndex}</span>
                ) : (
                  <span style={{ color: 'var(--text-muted2)' }}>Descanso</span>
                )}
              </div>
            ))}
          </div>

          {season && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--hairline)' }}>
              <button
                type="button"
                onClick={handleGenerateRounds}
                disabled={generating || existingRoundNumbers.length >= form.min_matches}
                className="w-full py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-90 disabled:opacity-50"
                style={{ background: generateOk ? 'var(--green)' : 'var(--accent)', color: '#fff' }}
              >
                {generating
                  ? 'Creando jornadas...'
                  : generateOk
                    ? '✓ Jornadas creadas'
                    : existingRoundNumbers.length >= form.min_matches
                      ? '✓ Ya están todas creadas'
                      : `🗓️ Generar ${form.min_matches - existingRoundNumbers.length} jornada(s) que faltan`}
              </button>
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Crea las jornadas con su fecha y responsable de reserva (rotando entre jugadores). Las parejas de cada partido se asignan después, jornada a jornada.
              </p>
              {generateError && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--red)' }}>⚠ {generateError}</p>
              )}
            </div>
          )}
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
