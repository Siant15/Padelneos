'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { revalidateLigaData } from '@/lib/actions'
import ClubPicker from '@/components/ClubPicker'
import { friendlyError } from '@/lib/errors'

type Form = { scheduled_date: string; scheduled_time: string; club: string; court_cost: string }

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12,
  background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 16, outline: 'none',
}

// Pantalla corta solo para reservar la pista: día, hora, club y lo que
// costó. Parejas, estado y responsable siguen en "Editar jornada".
export default function ReservaForm({ roundId, roundNumber, bookerName, isResponsable, initial }: {
  roundId: string
  roundNumber: number
  bookerName: string | null
  isResponsable: boolean
  initial: Form
}) {
  const supabase = createClient()
  const router = useRouter()
  const [form, setForm] = useState<Form>(initial)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const isPast = !!form.scheduled_date && form.scheduled_date < today
  const missing = [!form.scheduled_date && 'día', !form.scheduled_time && 'hora', !form.club && 'club'].filter(Boolean) as string[]
  const cost = form.court_cost ? parseFloat(form.court_cost) : null
  const badCost = cost !== null && (Number.isNaN(cost) || cost < 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (badCost) return
    setLoading(true)
    setError('')
    const { error: updateError } = await supabase.from('rounds').update({
      scheduled_date: form.scheduled_date || null,
      scheduled_time: form.scheduled_time || null,
      club: form.club || null,
      court_cost: isResponsable ? cost : undefined,
    }).eq('id', roundId)
    if (updateError) {
      setError(friendlyError(updateError.message, 'No se pudo guardar la reserva. Inténtalo de nuevo.'))
      setLoading(false)
      return
    }
    await revalidateLigaData()
    setSaved(true)
    setLoading(false)
    setTimeout(() => { router.push('/liga'); router.refresh() }, 900)
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
        <h1 className="text-xl font-bold">Reservar pista · J{roundNumber}</h1>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Responsable de la reserva: <strong>{bookerName ?? 'sin asignar'}</strong>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>📅 Día</label>
          <input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} style={inputStyle} />
          {isPast && (
            <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--orange)' }}>
              ⚠ Esa fecha ya pasó: las apuestas de esta jornada quedarán cerradas. Elige el día real del partido.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>🕒 Hora</label>
          <input type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} style={inputStyle} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>📍 Club</label>
          <ClubPicker value={form.club} onChange={v => setForm(f => ({ ...f, club: v }))} />
        </div>

        <div className="rounded-xl p-3.5 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <label className="block text-sm font-semibold">💸 Importe de la pista (€)</label>
          <input
            type="number" inputMode="decimal" min={0} step="0.01"
            value={form.court_cost}
            onChange={e => setForm(f => ({ ...f, court_cost: e.target.value }))}
            disabled={!isResponsable}
            placeholder="Ej: 18"
            style={{ ...inputStyle, opacity: isResponsable ? 1 : 0.6 }}
          />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isResponsable
              ? 'Lo que pagaste por la pista. Sirve para saber quién compensa a quién al terminar la liga.'
              : `Solo ${bookerName ?? 'quien reserva'} puede poner el importe, porque es quien paga la pista.`}
          </p>
          {badCost && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ El importe no es válido.</p>}
        </div>

        {missing.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Falta: {missing.join(', ')}. Mientras tanto la jornada aparece como «Pendiente de reserva».
          </p>
        )}
        {error && <p className="text-sm font-semibold" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

        <button type="submit" disabled={loading || badCost || saved}
          className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90 disabled:opacity-50"
          style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}>
          {saved ? '✓ Guardado' : loading ? 'Guardando...' : 'Guardar reserva'}
        </button>
      </form>
    </div>
  )
}
