'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Profile } from '@/lib/types'
import { isValidSetScore } from '@/lib/types'
import { revalidateLigaData } from '@/lib/actions'

type PairForm = { team1_p1_id: string; team1_p2_id: string; team2_p1_id: string; team2_p2_id: string }
type SetScore = { t1: string; t2: string }
type RoundPlayer = { id: string; name: string; team: 1 | 2 }

type MatchStatus = {
  winner: 'team1' | 'team2' | null
  error: string | null
  needsThirdSet: boolean
  decidedInTwo: boolean
}

function evaluateSets(sets: SetScore[]): MatchStatus {
  const parsed = sets.map(s => ({
    t1: s.t1.trim() === '' ? null : parseInt(s.t1, 10),
    t2: s.t2.trim() === '' ? null : parseInt(s.t2, 10),
  }))
  const [s1, s2, s3] = parsed
  const notDecided = { winner: null, error: null, needsThirdSet: false, decidedInTwo: false } as const

  if (s1.t1 === null || s1.t2 === null || s2.t1 === null || s2.t2 === null) {
    return notDecided
  }
  if (!isValidSetScore(s1.t1, s1.t2)) {
    return { ...notDecided, error: 'El set 1 no es un resultado válido de pádel (6-0 a 6-4, 7-5 o 7-6)' }
  }
  if (!isValidSetScore(s2.t1, s2.t2)) {
    return { ...notDecided, error: 'El set 2 no es un resultado válido de pádel (6-0 a 6-4, 7-5 o 7-6)' }
  }

  const w1 = s1.t1 > s1.t2 ? 'team1' : 'team2'
  const w2 = s2.t1 > s2.t2 ? 'team1' : 'team2'
  if (w1 === w2) return { winner: w1, error: null, needsThirdSet: false, decidedInTwo: true }

  // 1-1: hace falta un tercer set decisivo
  if (!s3 || s3.t1 === null || s3.t2 === null) {
    return { ...notDecided, needsThirdSet: true }
  }
  if (!isValidSetScore(s3.t1, s3.t2)) {
    return { ...notDecided, error: 'El set 3 no es un resultado válido de pádel (6-0 a 6-4, 7-5 o 7-6)' }
  }
  const w3 = s3.t1 > s3.t2 ? 'team1' : 'team2'
  return { winner: w3, error: null, needsThirdSet: false, decidedInTwo: false }
}

export default function ResultadoForm({ roundId, roundNumber, mode, matchId: initialMatchId, players: initialRoundPlayers, sets: initialSets, allPlayers }: {
  roundId: string
  roundNumber: number
  mode: 'ready' | 'no-match'
  matchId: string
  players: RoundPlayer[]
  sets: SetScore[]
  allPlayers: Profile[]
}) {
  const supabase = createClient()
  const router = useRouter()

  const [matchId, setMatchId] = useState(initialMatchId)
  const [players, setPlayers] = useState<RoundPlayer[]>(initialRoundPlayers)
  const [sets, setSets] = useState<SetScore[]>(initialSets)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loadState, setLoadState] = useState<'ready' | 'no-match'>(mode)
  const [pairForm, setPairForm] = useState<PairForm>({ team1_p1_id: '', team1_p2_id: '', team2_p1_id: '', team2_p2_id: '' })
  const [creatingMatch, setCreatingMatch] = useState(false)
  const [pairError, setPairError] = useState('')

  const { winner, error: setsError, needsThirdSet, decidedInTwo } = evaluateSets(sets)
  const hasThirdSet = sets.length === 3

  function setScore(setIdx: number, team: 't1' | 't2', value: string) {
    setSets(prev => prev.map((s, i) => i === setIdx ? { ...s, [team]: value } : s))
  }

  function toggleThirdSet() {
    if (hasThirdSet) {
      setSets(sets.slice(0, 2))
    } else {
      setSets([...sets, { t1: '', t2: '' }])
    }
  }

  const pairIds = [pairForm.team1_p1_id, pairForm.team1_p2_id, pairForm.team2_p1_id, pairForm.team2_p2_id].filter(Boolean)
  const pairsHaveDuplicate = new Set(pairIds).size !== pairIds.length
  const allPairsSelected = pairIds.length === 4

  async function handleCreateMatch() {
    if (!allPairsSelected || pairsHaveDuplicate) return
    setCreatingMatch(true)
    setPairError('')

    const { data: newMatch, error } = await supabase.from('matches').insert({
      round_id: roundId,
      team1_p1_id: pairForm.team1_p1_id,
      team1_p2_id: pairForm.team1_p2_id,
      team2_p1_id: pairForm.team2_p1_id,
      team2_p2_id: pairForm.team2_p2_id,
    }).select().single()

    setCreatingMatch(false)
    if (error || !newMatch) {
      setPairError('No se pudo crear el partido: ' + (error?.message ?? 'error desconocido'))
      return
    }

    setMatchId(newMatch.id)
    setPlayers([
      { id: pairForm.team1_p1_id, name: allPlayers.find(p => p.id === pairForm.team1_p1_id)?.name ?? '', team: 1 },
      { id: pairForm.team1_p2_id, name: allPlayers.find(p => p.id === pairForm.team1_p2_id)?.name ?? '', team: 1 },
      { id: pairForm.team2_p1_id, name: allPlayers.find(p => p.id === pairForm.team2_p1_id)?.name ?? '', team: 2 },
      { id: pairForm.team2_p2_id, name: allPlayers.find(p => p.id === pairForm.team2_p2_id)?.name ?? '', team: 2 },
    ])
    setLoadState('ready')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!matchId || !winner) return
    setLoading(true)
    setSaveError('')

    const [s1, s2, s3] = sets

    const { error: matchError } = await supabase.from('matches').update({
      set1_t1: parseInt(s1.t1) || 0,
      set1_t2: parseInt(s1.t2) || 0,
      set2_t1: parseInt(s2.t1) || 0,
      set2_t2: parseInt(s2.t2) || 0,
      set3_t1: s3 ? parseInt(s3.t1) || 0 : null,
      set3_t2: s3 ? parseInt(s3.t2) || 0 : null,
      winner,
      played_at: new Date().toISOString(),
    }).eq('id', matchId)

    if (matchError) {
      setSaveError('No se pudo guardar el resultado: ' + matchError.message)
      setLoading(false)
      return
    }

    const { error: roundError } = await supabase.from('rounds').update({ status: 'played' }).eq('id', roundId)
    if (roundError) {
      setSaveError('Resultado guardado, pero no se pudo marcar la jornada como jugada: ' + roundError.message)
      setLoading(false)
      return
    }

    // Con el resultado ya guardado, las preguntas de apuestas automáticas
    // (ganador, resultado por sets, marcador exacto, tie-break...) se
    // resuelven solas; las anecdóticas se siguen resolviendo a mano
    // desde Mercados/Acta.
    const { error: autoResolveError } = await supabase.rpc('auto_resolve_round_markets', { p_round_id: roundId })
    if (autoResolveError) {
      setSaveError('Resultado guardado, pero fallaron las apuestas automáticas: ' + autoResolveError.message)
      setLoading(false)
      return
    }

    await revalidateLigaData()
    setSaved(true)
    setLoading(false)
    router.refresh()
  }

  const team1Players = players.filter(p => p.team === 1)
  const team2Players = players.filter(p => p.team === 2)

  function buildShareMessage(): string {
    const [s1, s2, s3] = sets
    const scoreParts = [`${s1.t1}-${s1.t2}`, `${s2.t1}-${s2.t2}`]
    if (s3) scoreParts.push(`${s3.t1}-${s3.t2}`)
    const winnerNames = (winner === 'team1' ? team1Players : team2Players).map(p => p.name).join(' y ')

    const lines = [
      `🎾 Jornada ${roundNumber}`,
      `${team1Players.map(p => p.name).join(' / ')} vs ${team2Players.map(p => p.name).join(' / ')}`,
      `Resultado: ${scoreParts.join(', ')} → ganan ${winnerNames} 🏆`,
    ]

    lines.push('', '¡A por la próxima! 💪')
    return lines.join('\n')
  }

  async function handleShare() {
    const text = buildShareMessage()
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch { /* usuario canceló, seguimos al fallback */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
        <h1 className="text-xl font-bold">Resultado del partido</h1>
      </div>

      {loadState === 'no-match' && (
        <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Esta jornada todavía no tiene parejas asignadas. Elige los 4 jugadores para crear el partido y poder registrar el resultado.
          </p>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--accent)' }}>Pareja 1</p>
              <div className="grid grid-cols-2 gap-2">
                <PairPlayerSelect
                  value={pairForm.team1_p1_id}
                  onChange={v => setPairForm(f => ({ ...f, team1_p1_id: v }))}
                  players={allPlayers}
                  exclude={[pairForm.team1_p2_id, pairForm.team2_p1_id, pairForm.team2_p2_id]}
                  label="Jugador A"
                />
                <PairPlayerSelect
                  value={pairForm.team1_p2_id}
                  onChange={v => setPairForm(f => ({ ...f, team1_p2_id: v }))}
                  players={allPlayers}
                  exclude={[pairForm.team1_p1_id, pairForm.team2_p1_id, pairForm.team2_p2_id]}
                  label="Jugador B"
                />
              </div>
            </div>
            <div className="text-center text-sm font-bold" style={{ color: 'var(--text-muted)' }}>vs</div>
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--orange)' }}>Pareja 2</p>
              <div className="grid grid-cols-2 gap-2">
                <PairPlayerSelect
                  value={pairForm.team2_p1_id}
                  onChange={v => setPairForm(f => ({ ...f, team2_p1_id: v }))}
                  players={allPlayers}
                  exclude={[pairForm.team1_p1_id, pairForm.team1_p2_id, pairForm.team2_p2_id]}
                  label="Jugador C"
                />
                <PairPlayerSelect
                  value={pairForm.team2_p2_id}
                  onChange={v => setPairForm(f => ({ ...f, team2_p2_id: v }))}
                  players={allPlayers}
                  exclude={[pairForm.team1_p1_id, pairForm.team1_p2_id, pairForm.team2_p1_id]}
                  label="Jugador D"
                />
              </div>
            </div>
          </div>
          {pairsHaveDuplicate && (
            <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ Un jugador no puede estar en las dos parejas a la vez.</p>
          )}
          {pairError && (
            <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {pairError}</p>
          )}
          <button
            onClick={handleCreateMatch}
            disabled={!allPairsSelected || pairsHaveDuplicate || creatingMatch}
            className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {creatingMatch ? 'Creando...' : 'Crear partido y continuar'}
          </button>
        </div>
      )}

      {loadState === 'ready' && (
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Sets */}
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-4">Marcador</p>

            {/* Cada pareja es una fila, cada set una columna */}
            <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: `1fr repeat(${sets.length}, 3rem)` }}>
              <span />
              {sets.map((_, i) => (
                <span key={i} className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>Set {i + 1}</span>
              ))}
            </div>

            <div className="grid gap-2 items-center mb-2" style={{ gridTemplateColumns: `1fr repeat(${sets.length}, 3rem)` }}>
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--accent)' }}>
                {team1Players.map(p => p.name).join(' & ')}
              </span>
              {sets.map((s, i) => (
                <input key={i} type="number" min={0} max={7} value={s.t1}
                  onChange={e => setScore(i, 't1', e.target.value)}
                  className="text-center rounded-lg py-2 text-sm font-bold outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              ))}
            </div>

            <div className="grid gap-2 items-center" style={{ gridTemplateColumns: `1fr repeat(${sets.length}, 3rem)` }}>
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--orange)' }}>
                {team2Players.map(p => p.name).join(' & ')}
              </span>
              {sets.map((s, i) => (
                <input key={i} type="number" min={0} max={7} value={s.t2}
                  onChange={e => setScore(i, 't2', e.target.value)}
                  className="text-center rounded-lg py-2 text-sm font-bold outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              ))}
            </div>

            {(hasThirdSet || !decidedInTwo) && (
              <button type="button" onClick={toggleThirdSet}
                className="mt-3 text-xs px-3 py-1.5 rounded-lg transition hover:opacity-80"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {hasThirdSet ? '− Quitar 3.º set' : '+ Añadir 3.º set'}
              </button>
            )}
            {decidedInTwo && !hasThirdSet && (
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                Partido decidido en 2 sets — no hace falta un 3.º.
              </p>
            )}

            {setsError && (
              <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--red)' }}>⚠ {setsError}</p>
            )}
            {needsThirdSet && (
              <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--orange)' }}>
                1-1 en sets: añade el 3.º set para decidir el ganador.
              </p>
            )}

            {/* Resultado calculado */}
            {winner && (
              <div className="mt-4 pt-4 text-sm font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
                Ganador calculado:{' '}
                <span style={{ color: 'var(--green)' }}>
                  {winner === 'team1'
                    ? team1Players.map(p => p.name).join(' & ')
                    : team2Players.map(p => p.name).join(' & ')}
                </span>
              </div>
            )}
          </div>

          {saveError && (
            <p className="text-sm font-semibold text-center" style={{ color: 'var(--red)' }}>⚠ {saveError}</p>
          )}

          {saved ? (
            <div className="space-y-2">
              <div className="w-full py-3 rounded-xl font-semibold text-center" style={{ background: 'var(--green)', color: '#fff' }}>
                ✓ Guardado
              </div>
              {/* El resultado ya resuelve solo "Ganador"/"Resultado por
                  sets"/etc, pero las preguntas anecdóticas (doble falta,
                  smash al cristal...) no se pueden deducir del marcador —
                  hay que resolverlas a mano, o la jornada se queda sin
                  poder liquidarse nunca. */}
              <Link href={`/admin/jornadas/${roundId}/mercados`}
                className="block w-full py-3 rounded-xl font-semibold text-center transition hover:opacity-90"
                style={{ background: 'var(--orange-bg)', color: 'var(--orange)' }}>
                ⚠️ Resolver las preguntas de apuestas pendientes →
              </Link>
              <button type="button" onClick={handleShare}
                className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90"
                style={{ background: '#25D366', color: '#fff' }}>
                📤 Compartir resultado
              </button>
              <button type="button" onClick={() => router.push('/liga')}
                className="w-full py-2 text-sm font-semibold text-center"
                style={{ color: 'var(--text-muted)' }}>
                Volver a la Liga
              </button>
            </div>
          ) : (
            <button type="submit" disabled={loading || !winner}
              className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {!winner ? 'Completa el marcador primero' :
                loading ? 'Guardando...' : 'Guardar resultado'}
            </button>
          )}
        </form>
      )}
    </div>
  )
}

function PairPlayerSelect({ value, onChange, players, exclude, label }: {
  value: string
  onChange: (v: string) => void
  players: Profile[]
  exclude: string[]
  label: string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
    >
      <option value="">{label}</option>
      {players.filter(p => !exclude.includes(p.id) || p.id === value).map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}
