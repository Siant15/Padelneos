'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { revalidateLigaData } from '@/lib/actions'
import { rescheduleFollowingRounds } from '@/lib/schedule-actions'
import { friendlyError } from '@/lib/errors'
import { evaluateSets, type SetScore } from '@/lib/evaluate-sets'
import { RESET_NOTIFICATION_FLAGS } from '@/lib/rounds'
import { isValidSetScore } from '@/lib/types'
import ClubPicker from '@/components/ClubPicker'
import type { AdminRoundData, AdminMarket } from '@/lib/admin-actions'

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
  background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 16, outline: 'none',
}
const btnPrimary: React.CSSProperties = { background: 'var(--accent)', color: '#fff' }
const btnGhost: React.CSSProperties = { background: 'var(--tint)', color: 'var(--text-muted)' }
const btnDanger: React.CSSProperties = { background: 'var(--orange-bg)', color: '#7A5A1E' }

type Msg = { kind: 'ok' | 'err'; text: string } | null

export default function GestionarJornada({ data }: { data: AdminRoundData }) {
  const supabase = createClient()
  const router = useRouter()
  const { round, match, players, markets, settlement } = data
  const settled = !!settlement

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  // Ejecuta una operación: bloquea los botones, enseña el resultado y, si fue
  // bien, invalida las cachés y recarga los datos guardados.
  async function act(okText: string, fn: () => Promise<string | null>) {
    setBusy(true)
    setMsg(null)
    try {
      const error = await fn()
      if (error) { setMsg({ kind: 'err', text: error }); return }
      await revalidateLigaData()
      router.refresh()
      setMsg({ kind: 'ok', text: `✓ ${okText}` })
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e instanceof Error ? e.message : undefined, 'No se pudo completar la operación.') })
    } finally {
      setBusy(false)
    }
  }
  const fail = (raw: string | undefined, fallback: string) => friendlyError(raw, fallback)

  const playerName = (id: string | null) => players.find(p => p.id === id)?.name ?? '—'
  const totalBets = markets.reduce((n, m) => n + m.bets.length, 0)
  const pending = markets.filter(m => !m.resolved).length

  // ─── Reserva ───────────────────────────────────────────────
  const [res, setRes] = useState({
    date: round.scheduledDate ?? '',
    time: round.scheduledTime?.slice(0, 5) ?? '',
    club: round.club ?? '',
    cost: round.courtCost === null ? '' : String(round.courtCost),
    booker: round.courtBookerId ?? '',
    confirmed: round.courtConfirmed,
    status: round.status,
    reschedule: false,
  })

  function saveReserva() {
    const cost = res.cost.trim() === '' ? null : parseFloat(res.cost)
    if (cost !== null && (Number.isNaN(cost) || cost < 0)) { setMsg({ kind: 'err', text: 'El importe no es válido.' }); return }
    const dateOrTimeChanged = res.date !== (round.scheduledDate ?? '') || res.time !== (round.scheduledTime?.slice(0, 5) ?? '')
    if (dateOrTimeChanged && totalBets > 0 && !window.confirm(`Hay ${totalBets} apuestas en esta jornada. Cambiar el día o la hora cambia también la hora de cierre de las apuestas. ¿Continuar?`)) return
    act('Reserva guardada', async () => {
      const { error } = await supabase.from('rounds').update({
        scheduled_date: res.date || null,
        scheduled_time: res.time || null,
        club: res.club || null,
        court_cost: cost,
        court_booker_id: res.booker || null,
        court_confirmed: res.confirmed,
        status: res.status,
        ...(dateOrTimeChanged ? RESET_NOTIFICATION_FLAGS : {}),
      }).eq('id', round.id)
      if (error) return fail(error.message, 'No se pudo guardar la reserva.')
      if (res.reschedule && res.date !== (round.scheduledDate ?? '')) {
        const { error: reErr } = await rescheduleFollowingRounds(round.id)
        if (reErr) return fail(reErr, 'Reserva guardada, pero no se pudieron recolocar las jornadas siguientes.')
      }
      return null
    })
  }

  // ─── Parejas ───────────────────────────────────────────────
  const [pairs, setPairs] = useState({
    a1: match?.team1p1 ?? '', a2: match?.team1p2 ?? '', b1: match?.team2p1 ?? '', b2: match?.team2p2 ?? '',
  })
  const pairIds = [pairs.a1, pairs.a2, pairs.b1, pairs.b2].filter(Boolean)
  const pairsOk = pairIds.length === 4 && new Set(pairIds).size === 4

  function savePairs() {
    if (!pairsOk) return
    if (totalBets > 0 && !window.confirm('Hay apuestas en esta jornada. Las apuestas a «Ganador» y «Resultado por sets» pasarán a significar las parejas nuevas. Revísalas después en «Preguntas y apuestas». ¿Continuar?')) return
    act('Parejas guardadas', async () => {
      const cols = { team1_p1_id: pairs.a1, team1_p2_id: pairs.a2, team2_p1_id: pairs.b1, team2_p2_id: pairs.b2 }
      if (match) {
        const { error } = await supabase.from('matches').update(cols).eq('id', match.id)
        if (error) return fail(error.message, 'No se pudieron guardar las parejas.')
      } else {
        const { error } = await supabase.from('matches').insert({ round_id: round.id, ...cols })
        if (error) return fail(error.message, 'No se pudo crear el partido.')
      }
      const { error: labelsError } = await supabase.rpc('refresh_round_option_labels', { p_round_id: round.id })
      if (labelsError) return fail(labelsError.message, 'Parejas guardadas, pero no se pudieron actualizar los textos de las preguntas.')
      return null
    })
  }

  // ─── Resultado ─────────────────────────────────────────────
  const [sets, setSets] = useState<SetScore[]>(() => {
    const base = (match?.sets ?? [[null, null], [null, null], [null, null]]).map(([a, b]) => ({ t1: a === null ? '' : String(a), t2: b === null ? '' : String(b) }))
    return base[2]?.t1 === '' && base[2]?.t2 === '' ? base.slice(0, 2) : base
  })
  const evalr = evaluateSets(sets)
  const hasResult = !!match?.winner

  function setSetValue(i: number, side: 't1' | 't2', raw: string) {
    const value = raw.replace(/\D/g, '').slice(-1)
    if (value !== '' && parseInt(value, 10) > 7) return
    const next = sets.map((s, j) => j === i ? { ...s, [side]: value } : s)
    setSets(next.length === 2 && evaluateSets(next).needsThirdSet ? [...next, { t1: '', t2: '' }] : next)
  }

  function saveResult() {
    if (!match) { setMsg({ kind: 'err', text: 'Primero define las parejas para crear el partido.' }); return }
    if (!evalr.winner) { setMsg({ kind: 'err', text: evalr.error ?? 'El marcador no está completo.' }); return }
    act('Resultado guardado', async () => {
      const [s1, s2, s3] = sets
      const { error } = await supabase.from('matches').update({
        set1_t1: parseInt(s1.t1), set1_t2: parseInt(s1.t2), set2_t1: parseInt(s2.t1), set2_t2: parseInt(s2.t2),
        set3_t1: s3 ? parseInt(s3.t1) : null, set3_t2: s3 ? parseInt(s3.t2) : null,
        winner: evalr.winner, played_at: new Date().toISOString(),
      }).eq('id', match.id)
      if (error) return fail(error.message, 'No se pudo guardar el resultado.')

      // Las preguntas automáticas se reabren para resolverse con el marcador nuevo.
      const autoIds = markets.filter(m => m.isAutomatic && m.resolved).map(m => m.id)
      if (autoIds.length) {
        const { error: reopenError } = await supabase.from('betting_markets')
          .update({ resolved: false, voided: false, winning_option_id: null }).in('id', autoIds)
        if (reopenError) return fail(reopenError.message, 'Resultado guardado, pero no se pudieron recalcular las preguntas automáticas.')
      }
      const { data: flipped, error: statusError } = await supabase.from('rounds')
        .update({ status: 'played' }).eq('id', round.id).eq('status', 'scheduled').select('id')
      if (statusError) return fail(statusError.message, 'Resultado guardado, pero no se pudo marcar la jornada como jugada.')
      if (flipped?.length) await rescheduleFollowingRounds(round.id)
      const { error: autoError } = await supabase.rpc('auto_resolve_round_markets', { p_round_id: round.id })
      if (autoError) return fail(autoError.message, 'Resultado guardado, pero fallaron las preguntas automáticas.')
      return null
    })
  }

  function clearResult() {
    if (!window.confirm('¿Borrar el resultado? La jornada vuelve a «programada» y las preguntas automáticas se reabren. Si estaba liquidada, se deshace la liquidación.')) return
    act('Resultado borrado', async () => {
      const { error } = await supabase.rpc('admin_reset_round', { p_round_id: round.id, p_result: true, p_reservation: false, p_bets: false })
      return error ? fail(error.message, 'No se pudo borrar el resultado.') : null
    })
  }

  // ─── Preguntas y apuestas ──────────────────────────────────
  function setMarketState(m: AdminMarket, patch: { resolved: boolean; voided: boolean; winning_option_id: string | null }, okText: string) {
    act(okText, async () => {
      const { error } = await supabase.from('betting_markets').update(patch).eq('id', m.id)
      return error ? fail(error.message, 'No se pudo cambiar la pregunta.') : null
    })
  }

  function deleteBet(betId: string) {
    if (!window.confirm('¿Borrar esta apuesta?')) return
    act('Apuesta borrada', async () => {
      const { error } = await supabase.rpc('admin_delete_bet', { p_bet_id: betId })
      return error ? fail(error.message, 'No se pudo borrar la apuesta.') : null
    })
  }

  function setBet(m: AdminMarket, playerId: string, optionId: string, chips: number, scoreText: string) {
    act('Apuesta guardada', async () => {
      let option = optionId
      let amount = chips
      if (m.type === 'exact_score') {
        const parsed = scoreText.trim().split(/[,\s]+/).filter(Boolean).map(t => {
          const [a, b] = t.split('-').map(n => parseInt(n, 10))
          return { a, b }
        })
        if (parsed.length < 2 || parsed.length > 3 || parsed.some(p => Number.isNaN(p.a) || Number.isNaN(p.b) || !isValidSetScore(p.a, p.b))) {
          return 'Marcador no válido. Escríbelo así: 6-3 4-6 6-3'
        }
        const { data: optId, error: optErr } = await supabase.rpc('instantiate_exact_score_option', {
          p_market_id: m.id,
          p_value: parsed.map(p => `${p.a}-${p.b}`).join(','),
          p_label: parsed.map(p => `${p.a}-${p.b}`).join(', '),
        })
        if (optErr || !optId) return fail(optErr?.message, 'No se pudo registrar ese marcador.')
        option = optId as string
        amount = 0
      }
      if (!playerId || !option) return 'Elige jugador y respuesta.'
      const { error } = await supabase.rpc('admin_set_bet', { p_market_id: m.id, p_player_id: playerId, p_option_id: option, p_chips: amount })
      return error ? fail(error.message, 'No se pudo guardar la apuesta.') : null
    })
  }

  // ─── Liquidación y reinicio ────────────────────────────────
  function settle() {
    act('Jornada liquidada', async () => {
      const { error } = await supabase.rpc('settle_round', { p_round_id: round.id })
      if (error) return fail(error.message, 'No se pudo liquidar la jornada.')
      await supabase.rpc('prune_stale_question_templates')
      return null
    })
  }
  function unsettle() {
    if (!window.confirm('¿Deshacer la liquidación? Se borran los premios y puntos de apuestas de esta jornada y se devuelven los botes. Las preguntas se quedan resueltas.')) return
    act('Liquidación deshecha', async () => {
      const { error } = await supabase.rpc('admin_unsettle_round', { p_round_id: round.id })
      return error ? fail(error.message, 'No se pudo deshacer la liquidación.') : null
    })
  }
  function resettle() {
    if (!window.confirm('¿Volver a liquidar? Se deshace el reparto actual y se recalcula con los datos de ahora.')) return
    act('Jornada liquidada de nuevo', async () => {
      const { error: undoError } = await supabase.rpc('admin_unsettle_round', { p_round_id: round.id })
      if (undoError) return fail(undoError.message, 'No se pudo deshacer la liquidación.')
      const { error } = await supabase.rpc('settle_round', { p_round_id: round.id })
      return error ? fail(error.message, 'Liquidación deshecha, pero no se pudo volver a liquidar.') : null
    })
  }

  const [reset, setReset] = useState({ result: true, reservation: true, bets: true })
  function resetRound() {
    if (!reset.result && !reset.reservation && !reset.bets) return
    const parts = [reset.result && 'el resultado', reset.reservation && 'la reserva (día, hora, club y precio)', reset.bets && 'todas las apuestas y respuestas'].filter(Boolean).join(', ')
    if (!window.confirm(`Se borrará: ${parts}. Las parejas y el responsable se conservan. Esto no se puede deshacer. ¿Continuar?`)) return
    act('Jornada reiniciada', async () => {
      const { error } = await supabase.rpc('admin_reset_round', { p_round_id: round.id, p_result: reset.result, p_reservation: reset.reservation, p_bets: reset.bets })
      return error ? fail(error.message, 'No se pudo reiniciar la jornada.') : null
    })
  }

  return (
    <div className="space-y-5 pb-8 overflow-x-hidden">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Admin</Link>
        <h1 className="text-xl font-bold">Gestionar J{round.roundNumber}</h1>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Aquí el administrador puede registrar o corregir cualquier dato de la jornada, también cuando ya está cerrada.
      </p>

      <div className="rounded-xl p-3 text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ background: 'var(--surface2)' }}>
        <span><strong>Estado:</strong> {round.status === 'played' ? 'jugada' : round.status === 'cancelled' ? 'cancelada' : 'programada'}</span>
        <span><strong>Resultado:</strong> {hasResult ? 'guardado' : 'sin resultado'}</span>
        <span><strong>Apuestas:</strong> {totalBets}</span>
        <span><strong>Preguntas sin resolver:</strong> {pending}</span>
        <span><strong>Liquidación:</strong> {settled ? `v${settlement!.version}` : 'no'}</span>
      </div>

      {msg && (
        <p className="rounded-xl p-3 text-sm font-semibold" style={msg.kind === 'ok' ? { background: 'var(--green-bg)', color: 'var(--green)' } : { background: 'var(--orange-bg)', color: '#7A5A1E' }}>
          {msg.kind === 'err' ? '⚠ ' : ''}{msg.text}
        </p>
      )}

      {/* Reserva */}
      <Section title="🏟️ Reserva y estado">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día"><input type="date" value={res.date} onChange={e => setRes(r => ({ ...r, date: e.target.value }))} style={inputStyle} /></Field>
          <Field label="Hora"><input type="time" value={res.time} onChange={e => setRes(r => ({ ...r, time: e.target.value }))} style={inputStyle} /></Field>
        </div>
        <Field label="Club"><ClubPicker value={res.club} onChange={v => setRes(r => ({ ...r, club: v }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Importe de la pista (€)"><input type="number" inputMode="decimal" min={0} step="0.01" value={res.cost} onChange={e => setRes(r => ({ ...r, cost: e.target.value }))} style={inputStyle} placeholder="Sin importe" /></Field>
          <Field label="Responsable">
            <select value={res.booker} onChange={e => setRes(r => ({ ...r, booker: e.target.value }))} style={inputStyle}>
              <option value="">Sin asignar</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Estado de la jornada">
          <select value={res.status} onChange={e => setRes(r => ({ ...r, status: e.target.value }))} style={inputStyle}>
            <option value="scheduled">Programada</option>
            <option value="played">Jugada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={res.confirmed} onChange={e => setRes(r => ({ ...r, confirmed: e.target.checked }))} /> Reserva confirmada (avisa de «apuestas abiertas» solo al confirmarla desde Inicio)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={res.reschedule} onChange={e => setRes(r => ({ ...r, reschedule: e.target.checked }))} /> Recolocar las fechas de las jornadas siguientes si cambio el día</label>
        <Btn onClick={saveReserva} busy={busy} style={btnPrimary}>Guardar reserva</Btn>
      </Section>

      {/* Parejas */}
      <Section title="🤝 Parejas">
        <div className="grid grid-cols-2 gap-2">
          <PlayerSelect value={pairs.a1} onChange={v => setPairs(p => ({ ...p, a1: v }))} players={players} label="Pareja 1 · A" />
          <PlayerSelect value={pairs.a2} onChange={v => setPairs(p => ({ ...p, a2: v }))} players={players} label="Pareja 1 · B" />
          <PlayerSelect value={pairs.b1} onChange={v => setPairs(p => ({ ...p, b1: v }))} players={players} label="Pareja 2 · C" />
          <PlayerSelect value={pairs.b2} onChange={v => setPairs(p => ({ ...p, b2: v }))} players={players} label="Pareja 2 · D" />
        </div>
        {!pairsOk && pairIds.length > 0 && <p className="text-xs" style={{ color: 'var(--red)' }}>Elige 4 jugadores distintos.</p>}
        <Btn onClick={savePairs} busy={busy || !pairsOk} style={btnPrimary}>{match ? 'Guardar parejas' : 'Crear partido con estas parejas'}</Btn>
      </Section>

      {/* Resultado */}
      <Section title="🎾 Resultado">
        {settled && <Lock>La jornada está liquidada. Para cambiar el resultado, deshaz antes la liquidación (más abajo).</Lock>}
        {!match ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Esta jornada aún no tiene partido: define antes las parejas.</p> : (
          <>
            <div className="grid gap-2 items-center" style={{ gridTemplateColumns: `1fr repeat(${sets.length}, 3rem)` }}>
              <span />{sets.map((_, i) => <span key={i} className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>Set {i + 1}</span>)}
              <span className="text-sm font-semibold break-words" style={{ color: 'var(--accent)' }}>{playerName(pairs.a1)} & {playerName(pairs.a2)}</span>
              {sets.map((s, i) => <input key={`a${i}`} type="text" inputMode="numeric" value={s.t1} disabled={settled} onChange={e => setSetValue(i, 't1', e.target.value)} onFocus={e => e.target.select()} className="text-center rounded-lg py-2 text-sm font-bold outline-none disabled:opacity-50" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />)}
              <span className="text-sm font-semibold break-words" style={{ color: 'var(--orange)' }}>{playerName(pairs.b1)} & {playerName(pairs.b2)}</span>
              {sets.map((s, i) => <input key={`b${i}`} type="text" inputMode="numeric" value={s.t2} disabled={settled} onChange={e => setSetValue(i, 't2', e.target.value)} onFocus={e => e.target.select()} className="text-center rounded-lg py-2 text-sm font-bold outline-none disabled:opacity-50" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />)}
            </div>
            <div className="flex gap-2">
              {sets.length === 2 && !settled && <button type="button" onClick={() => setSets([...sets, { t1: '', t2: '' }])} className="text-xs px-3 py-2 rounded-lg" style={btnGhost}>+ 3.º set</button>}
              {sets.length === 3 && !settled && <button type="button" onClick={() => setSets(sets.slice(0, 2))} className="text-xs px-3 py-2 rounded-lg" style={btnGhost}>− 3.º set</button>}
            </div>
            {evalr.error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {evalr.error}</p>}
            {evalr.needsThirdSet && <p className="text-xs" style={{ color: 'var(--orange)' }}>1-1 en sets: falta el 3.º set.</p>}
            {evalr.winner && <p className="text-sm font-semibold">Ganan: <span style={{ color: 'var(--green)' }}>{evalr.winner === 'team1' ? `${playerName(pairs.a1)} & ${playerName(pairs.a2)}` : `${playerName(pairs.b1)} & ${playerName(pairs.b2)}`}</span></p>}
            <div className="flex gap-2">
              <Btn onClick={saveResult} busy={busy || settled || !evalr.winner} style={btnPrimary}>Guardar resultado</Btn>
              {hasResult && <Btn onClick={clearResult} busy={busy} style={btnDanger}>Borrar resultado</Btn>}
            </div>
          </>
        )}
      </Section>

      {/* Preguntas y apuestas */}
      <Section title="🎰 Preguntas y apuestas">
        {settled && <Lock>La jornada está liquidada. Para cambiar respuestas o apuestas, deshaz antes la liquidación (más abajo).</Lock>}
        {markets.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Esta jornada no tiene preguntas.</p>}
        {markets.map(m => <MarketAdmin key={m.id} m={m} players={players} locked={settled} busy={busy}
          onState={setMarketState} onDeleteBet={deleteBet} onSetBet={setBet} />)}
      </Section>

      {/* Liquidación */}
      <Section title="🏆 Liquidación">
        {settled ? (
          <>
            <p className="text-sm font-semibold" style={{ color: 'var(--green)' }}>✓ Liquidada (versión {settlement!.version}, {new Date(settlement!.settledAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Si corriges algo, deshaz la liquidación, haz el cambio y vuelve a liquidar. Recomendado solo con la última jornada liquidada: los botes de las siguientes ya se calcularon con esta.</p>
            <div className="flex gap-2">
              <Btn onClick={unsettle} busy={busy} style={btnDanger}>Deshacer liquidación</Btn>
              <Btn onClick={resettle} busy={busy || pending > 0} style={btnGhost}>Volver a liquidar</Btn>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{pending === 1 ? 'Falta 1 pregunta por resolver o anular.' : pending > 0 ? `Faltan ${pending} preguntas por resolver o anular.` : 'Todas las preguntas están resueltas.'}</p>
            <Btn onClick={settle} busy={busy || pending > 0 || markets.length === 0} style={btnPrimary}>Liquidar jornada</Btn>
          </>
        )}
      </Section>

      {/* Reiniciar */}
      <Section title="🧹 Dejar la jornada como nueva">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Elige qué borrar. Las parejas y el responsable se conservan. Si estaba liquidada, se deshace la liquidación.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reset.result} onChange={e => setReset(r => ({ ...r, result: e.target.checked }))} /> Resultado (marcador y ganador)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reset.reservation} onChange={e => setReset(r => ({ ...r, reservation: e.target.checked }))} /> Reserva (día, hora, club, precio y confirmación)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reset.bets} onChange={e => setReset(r => ({ ...r, bets: e.target.checked }))} /> Apuestas y respuestas de las preguntas</label>
        <Btn onClick={resetRound} busy={busy || (!reset.result && !reset.reservation && !reset.bets)} style={btnDanger}>Reiniciar la jornada</Btn>
      </Section>
    </div>
  )
}

// ─── Una pregunta con sus respuestas y apuestas ────────────────
function MarketAdmin({ m, players, locked, busy, onState, onDeleteBet, onSetBet }: {
  m: AdminMarket
  players: { id: string; name: string }[]
  locked: boolean
  busy: boolean
  onState: (m: AdminMarket, patch: { resolved: boolean; voided: boolean; winning_option_id: string | null }, okText: string) => void
  onDeleteBet: (betId: string) => void
  onSetBet: (m: AdminMarket, playerId: string, optionId: string, chips: number, scoreText: string) => void
}) {
  const [winner, setWinner] = useState(m.winningOptionId ?? '')
  const [betPlayer, setBetPlayer] = useState('')
  const [betOption, setBetOption] = useState('')
  const [betChips, setBetChips] = useState('10')
  const [score, setScore] = useState('')
  const isExact = m.type === 'exact_score'
  const label = (id: string) => m.options.find(o => o.id === id)?.label ?? '?'
  const name = (id: string) => players.find(p => p.id === id)?.name ?? '?'
  const state = m.voided ? 'Anulada' : m.resolved ? `Resuelta: ${m.winningOptionId ? label(m.winningOptionId) : 'sin acertantes'}` : 'Sin resolver'

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{m.description}{m.isAutomatic && <span className="text-[11px] font-normal" style={{ color: 'var(--text-muted2)' }}> · automática</span>}</p>
        <span className="text-xs font-semibold shrink-0" style={{ color: m.resolved ? 'var(--green)' : 'var(--orange)' }}>{state}</span>
      </div>

      {!isExact && (
        <div className="flex gap-2">
          <select value={winner} onChange={e => setWinner(e.target.value)} disabled={locked} style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }}>
            <option value="">Elegir respuesta ganadora…</option>
            {m.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button type="button" disabled={locked || busy || !winner} onClick={() => onState(m, { resolved: true, voided: false, winning_option_id: winner }, 'Pregunta resuelta')} className="px-3 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--green)', color: '#fff' }}>Resolver</button>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <button type="button" disabled={locked || busy} onClick={() => onState(m, { resolved: true, voided: true, winning_option_id: null }, 'Pregunta anulada')} className="text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-40" style={btnDanger}>Anular (devolver fichas)</button>
        <button type="button" disabled={locked || busy || !m.resolved} onClick={() => onState(m, { resolved: false, voided: false, winning_option_id: null }, 'Pregunta reabierta')} className="text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-40" style={btnGhost}>Reabrir</button>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted2)' }}>Apuestas ({m.bets.length})</p>
        {m.bets.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nadie ha apostado.</p>}
        <ul className="flex flex-col gap-1">
          {m.bets.map(b => (
            <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate"><strong>{name(b.playerId)}</strong> → {label(b.optionId)}{b.chips > 0 ? ` · ${b.chips}f` : ''}</span>
              <button type="button" disabled={locked || busy} onClick={() => onDeleteBet(b.id)} className="shrink-0 px-2 py-1 rounded-lg disabled:opacity-40" style={btnDanger} aria-label="Borrar apuesta">🗑️</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg p-2 space-y-2" style={{ background: 'var(--surface2)' }}>
        <p className="text-[11px] font-bold" style={{ color: 'var(--text-muted2)' }}>Registrar o cambiar la apuesta de un jugador</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={betPlayer} onChange={e => setBetPlayer(e.target.value)} disabled={locked} style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }}>
            <option value="">Jugador…</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {isExact ? (
            <input value={score} onChange={e => setScore(e.target.value)} disabled={locked} placeholder="6-3 4-6 6-3" style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
          ) : (
            <select value={betOption} onChange={e => setBetOption(e.target.value)} disabled={locked} style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }}>
              <option value="">Respuesta…</option>
              {m.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
        </div>
        {!isExact && (
          <input type="number" inputMode="numeric" min={10} max={50} value={betChips} onChange={e => setBetChips(e.target.value)} disabled={locked} style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} placeholder="Fichas (10-50)" />
        )}
        <button type="button" disabled={locked || busy || !betPlayer || (isExact ? !score.trim() : !betOption)} onClick={() => onSetBet(m, betPlayer, betOption, parseInt(betChips, 10) || 0, score)} className="w-full py-2 rounded-lg text-sm font-semibold disabled:opacity-40" style={btnPrimary}>Guardar apuesta</button>
      </div>
    </div>
  )
}

// ─── Piezas pequeñas ────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4 space-y-3 min-w-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h2 className="font-heading font-bold text-sm">{title}</h2>
      {children}
    </section>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}
function Lock({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg p-2.5 text-xs font-semibold" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>🔒 {children}</p>
}
function Btn({ onClick, busy, style, children }: { onClick: () => void; busy: boolean; style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="flex-1 py-3 rounded-xl font-semibold text-sm transition hover:opacity-90 disabled:opacity-40" style={style}>
      {children}
    </button>
  )
}
function PlayerSelect({ value, onChange, players, label }: { value: string; onChange: (v: string) => void; players: { id: string; name: string }[]; label: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      <option value="">{label}</option>
      {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}
