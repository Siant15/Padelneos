'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { revalidateLigaData } from '@/lib/actions'
import { rescheduleFollowingRounds } from '@/lib/schedule-actions'
import ClubPicker from '@/components/ClubPicker'
import { friendlyError } from '@/lib/errors'
import { RESET_NOTIFICATION_FLAGS, isReservationRegistered } from '@/lib/rounds'

type PlayerLite = { id: string; name: string }

type FormState = {
  scheduled_date: string
  scheduled_time: string
  club: string
  court_booker_id: string
  status: string
  court_cost: string
  team1_p1_id: string
  team1_p2_id: string
  team2_p1_id: string
  team2_p2_id: string
  matchId: string
}

export default function EditarJornadaForm({ roundId, players, initialForm, initialHasResult, isResponsable, isAdmin }: {
  roundId: string
  players: PlayerLite[]
  initialForm: FormState
  initialHasResult: boolean
  isResponsable: boolean
  isAdmin: boolean
}) {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [hasResult, setHasResult] = useState(initialHasResult)
  const [form, setForm] = useState<FormState>(initialForm)

  // `hasResult` no depende de ningún input del usuario (a diferencia de
  // `form`, que si se resincronizara aquí perdería lo que esté
  // escribiendo si el Server Component revalida por otro motivo), así
  // que sí conviene mantenerlo al día si vuelve a renderizar con props
  // nuevas. Se ajusta durante el render, no en un efecto, para no sumar
  // una pasada de render extra.
  const [prevInitialHasResult, setPrevInitialHasResult] = useState(initialHasResult)
  if (initialHasResult !== prevInitialHasResult) {
    setPrevInitialHasResult(initialHasResult)
    setHasResult(initialHasResult)
  }

  const pairIds = [form.team1_p1_id, form.team1_p2_id, form.team2_p1_id, form.team2_p2_id].filter(Boolean)
  const hasDuplicatePlayers = new Set(pairIds).size !== pairIds.length
  const allPairsSelected = pairIds.length === 4

  // Con día, hora y club registrados, y con las parejas definidas, solo el
  // administrador puede cambiarlos (triggers 067: la base de datos también lo exige).
  const reservationLocked = !isAdmin && isReservationRegistered(initialForm)
  const pairsLocked = !isAdmin && !!(initialForm.matchId && initialForm.team1_p1_id && initialForm.team1_p2_id && initialForm.team2_p1_id && initialForm.team2_p2_id)

  const blockedPlayedWithoutResult = form.status === 'played' && !hasResult
  const blockedRevertWithResult = hasResult && form.status !== 'played'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (hasDuplicatePlayers || blockedPlayedWithoutResult || blockedRevertWithResult) return
    setLoading(true)
    setSaveError('')

    // Solo se envía lo que ha cambiado: así una pantalla abierta con datos
    // viejos no pisa lo que otro jugador haya guardado entretanto.
    const dateOrTimeChanged = !reservationLocked && (form.scheduled_date !== initialForm.scheduled_date || form.scheduled_time !== initialForm.scheduled_time)
    const roundUpdate: Record<string, unknown> = {}
    if (!reservationLocked) {
      if (form.scheduled_date !== initialForm.scheduled_date) roundUpdate.scheduled_date = form.scheduled_date || null
      if (form.scheduled_time !== initialForm.scheduled_time) roundUpdate.scheduled_time = form.scheduled_time || null
      if (form.club !== initialForm.club) roundUpdate.club = form.club || null
    }
    if (dateOrTimeChanged) Object.assign(roundUpdate, RESET_NOTIFICATION_FLAGS)
    if (form.court_booker_id !== initialForm.court_booker_id) roundUpdate.court_booker_id = form.court_booker_id || null
    if (form.status !== initialForm.status) roundUpdate.status = form.status
    if (isResponsable && form.court_cost !== initialForm.court_cost) roundUpdate.court_cost = form.court_cost ? parseFloat(form.court_cost) : null

    let roundError: { message: string } | null = null
    if (Object.keys(roundUpdate).length) {
      const res = await supabase.from('rounds').update(roundUpdate).eq('id', roundId)
      roundError = res.error
    }

    if (roundError) {
      setSaveError(friendlyError(roundError.message, 'No se pudo guardar la jornada. Inténtalo de nuevo.'))
      setLoading(false)
      return
    }

    if ((!reservationLocked && form.scheduled_date !== initialForm.scheduled_date) || form.status !== initialForm.status) {
      await rescheduleFollowingRounds(roundId)
    }

    if (form.matchId && pairsLocked) {
      // Parejas ya definidas: solo el administrador puede cambiarlas.
    } else if (form.matchId) {
      const { error: matchError } = await supabase.from('matches').update({
        team1_p1_id: form.team1_p1_id,
        team1_p2_id: form.team1_p2_id,
        team2_p1_id: form.team2_p1_id,
        team2_p2_id: form.team2_p2_id,
      }).eq('id', form.matchId)

      if (matchError) {
        setSaveError(friendlyError(matchError.message, 'Jornada guardada, pero las parejas fallaron.'))
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
        setSaveError(friendlyError(matchError.message, 'Jornada guardada, pero las parejas fallaron.'))
        setLoading(false)
        return
      }
      if (newMatch) setForm(f => ({ ...f, matchId: newMatch.id }))
    }

    // El emparejamiento pudo cambiar: los textos de "Ganador del
    // partido"/"Resultado por sets" (creados una vez al generar la
    // jornada) se quedarían con las parejas antiguas si no se
    // refrescan aquí. La resolución en sí no depende de esto — ya se
    // decide en vivo por el partido real — solo el texto mostrado.
    const { error: refreshError } = await supabase.rpc('refresh_round_option_labels', { p_round_id: roundId })
    if (refreshError) {
      setSaveError(friendlyError(refreshError.message, 'Jornada guardada, pero los textos de las apuestas no se pudieron actualizar.'))
      setLoading(false)
      return
    }

    await revalidateLigaData()
    setSaved(true)
    setLoading(false)
    setTimeout(() => { setSaved(false); router.push('/liga'); router.refresh() }, 1500)
  }

  return (
    <div className="space-y-5 pb-4 overflow-x-hidden">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
        <h1 className="text-xl font-bold">Editar jornada</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Mientras falte día, hora o club, esta jornada aparece como &quot;Pendiente de reserva&quot;.
        </p>

        {reservationLocked && (
          <p className="rounded-xl p-3 text-xs font-semibold" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>
            🔒 La reserva ya está registrada (día, hora y club). Solo el administrador puede cambiarla.
          </p>
        )}
        <fieldset disabled={reservationLocked} className="space-y-4 min-w-0 border-0 p-0 m-0">
        <Field label="Día">
          <input type="date" value={form.scheduled_date}
            onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
            style={inputStyle} />
        </Field>

        <Field label="Hora">
          <input type="time" value={form.scheduled_time}
            onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))}
            style={inputStyle} />
        </Field>

        <Field label="Club">
          <ClubPicker value={form.club} onChange={v => setForm(f => ({ ...f, club: v }))} />
        </Field>
        </fieldset>

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

        <Field label="💸 Coste de la pista (€)">
          <input
            type="number" min={0} step="0.01"
            value={form.court_cost}
            onChange={e => setForm(f => ({ ...f, court_cost: e.target.value }))}
            disabled={!isResponsable}
            placeholder="Ej: 18"
            style={{ ...inputStyle, opacity: isResponsable ? 1 : 0.6 }}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {isResponsable
              ? 'Se usa para calcular quién debe compensar a quién al terminar la liga.'
              : 'Solo quien reservó esta pista puede registrar lo que costó.'}
          </p>
        </Field>

        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-4">Parejas</p>
            {!form.matchId && (
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Esta jornada todavía no tiene parejas asignadas. Elige los 4 jugadores y guarda para crear el partido.
              </p>
            )}
            {pairsLocked && (
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                🔒 Las parejas ya están definidas. Solo el administrador puede cambiarlas.
              </p>
            )}
            {hasResult && !pairsLocked && (
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                🔒 Este partido ya tiene un resultado registrado. Para cambiar las parejas, borra antes el resultado.
              </p>
            )}
            <fieldset disabled={hasResult || pairsLocked} className="space-y-4">
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

      {/* Desde aquí mismo se cierra el partido: marcador + resolver las apuestas. */}
      <div className="rounded-xl p-3.5 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <Link
          href={`/admin/jornadas/${roundId}/resultado`}
          className="block w-full py-3 rounded-xl font-semibold text-center transition hover:opacity-90"
          style={{ background: 'var(--green)', color: '#fff' }}
        >
          📝 Anotar resultado
        </Link>
        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          Anota el resultado y resuelve las apuestas de la jornada. Guarda antes los cambios de arriba.
        </p>
      </div>
    </div>
  )
}

function PlayerSelect({ value, onChange, players, exclude, label }: {
  value: string
  onChange: (v: string) => void
  players: PlayerLite[]
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
    <div className="min-w-0">
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
}
