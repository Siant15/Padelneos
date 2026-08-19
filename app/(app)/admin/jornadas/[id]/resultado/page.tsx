'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import type { Profile } from '@/lib/types'

type SetScore = { t1: string; t2: string }
type StatEntry = { aces: number; double_faults: number; bolas_por_3: number; smash_al_cristal: number }

function calcWinner(sets: SetScore[]): 'team1' | 'team2' | null {
  let w1 = 0, w2 = 0
  for (const s of sets) {
    const n1 = parseInt(s.t1), n2 = parseInt(s.t2)
    if (isNaN(n1) || isNaN(n2)) continue
    if (n1 > n2) w1++; else if (n2 > n1) w2++
  }
  if (w1 > w2) return 'team1'
  if (w2 > w1) return 'team2'
  return null
}

export default function ResultadoPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const roundId = params.id as string

  const [matchId, setMatchId] = useState('')
  const [players, setPlayers] = useState<{ id: string; name: string; team: 1 | 2 }[]>([])
  const [sets, setSets] = useState<SetScore[]>([{ t1: '', t2: '' }, { t1: '', t2: '' }])
  const [stats, setStats] = useState<Record<string, StatEntry>>({})
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('rounds').select(`
      match:matches(id, set1_t1, set1_t2, set2_t1, set2_t2, set3_t1, set3_t2, winner,
        team1_p1:profiles!team1_p1_id(id, name),
        team1_p2:profiles!team1_p2_id(id, name),
        team2_p1:profiles!team2_p1_id(id, name),
        team2_p2:profiles!team2_p2_id(id, name))
    `).eq('id', roundId).single().then(({ data }) => {
      const m = data?.match as unknown as { id: string; set1_t1?: number; set1_t2?: number; set2_t1?: number; set2_t2?: number; set3_t1?: number; set3_t2?: number; team1_p1?: { id: string; name: string }; team1_p2?: { id: string; name: string }; team2_p1?: { id: string; name: string }; team2_p2?: { id: string; name: string } } | null
      if (!m) return
      setMatchId(m.id)

      const ps: { id: string; name: string; team: 1 | 2 }[] = ([
        { id: m.team1_p1?.id ?? '', name: m.team1_p1?.name ?? '', team: 1 as const },
        { id: m.team1_p2?.id ?? '', name: m.team1_p2?.name ?? '', team: 1 as const },
        { id: m.team2_p1?.id ?? '', name: m.team2_p1?.name ?? '', team: 2 as const },
        { id: m.team2_p2?.id ?? '', name: m.team2_p2?.name ?? '', team: 2 as const },
      ] as { id: string; name: string; team: 1 | 2 }[]).filter(p => p.id)
      setPlayers(ps)

      // Precargar sets existentes
      const existingSets: SetScore[] = [
        { t1: m.set1_t1?.toString() ?? '', t2: m.set1_t2?.toString() ?? '' },
        { t1: m.set2_t1?.toString() ?? '', t2: m.set2_t2?.toString() ?? '' },
      ]
      if (m.set3_t1 !== null && m.set3_t1 !== undefined) {
        existingSets.push({ t1: m.set3_t1.toString(), t2: m.set3_t2?.toString() ?? '' })
      }
      setSets(existingSets)

      // Precargar stats
      supabase.from('match_stats').select('*').eq('match_id', m.id).then(({ data: s }) => {
        if (s) {
          const statsMap: Record<string, StatEntry> = {}
          for (const st of s) {
            statsMap[st.player_id] = {
              aces: st.aces,
              double_faults: st.double_faults,
              bolas_por_3: st.bolas_por_3,
              smash_al_cristal: st.smash_al_cristal,
            }
          }
          setStats(statsMap)
        }
      })
    })
  }, [roundId])

  const winner = calcWinner(sets)
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

  function setStat(playerId: string, field: keyof StatEntry, value: number) {
    setStats(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId] ?? { aces: 0, double_faults: 0, bolas_por_3: 0, smash_al_cristal: 0 }, [field]: Math.max(0, value) }
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!matchId || !winner) return
    setLoading(true)

    const [s1, s2, s3] = sets

    // Guardar resultado del partido
    await supabase.from('matches').update({
      set1_t1: parseInt(s1.t1) || 0,
      set1_t2: parseInt(s1.t2) || 0,
      set2_t1: parseInt(s2.t1) || 0,
      set2_t2: parseInt(s2.t2) || 0,
      set3_t1: s3 ? parseInt(s3.t1) || 0 : null,
      set3_t2: s3 ? parseInt(s3.t2) || 0 : null,
      winner,
      played_at: new Date().toISOString(),
    }).eq('id', matchId)

    // Marcar jornada como jugada
    await supabase.from('rounds').update({ status: 'played' }).eq('id', roundId)

    // Guardar stats individuales
    for (const player of players) {
      const st = stats[player.id] ?? { aces: 0, double_faults: 0, bolas_por_3: 0, smash_al_cristal: 0 }
      await supabase.from('match_stats').upsert({
        match_id: matchId,
        player_id: player.id,
        aces: st.aces,
        double_faults: st.double_faults,
        bolas_por_3: st.bolas_por_3,
        smash_al_cristal: st.smash_al_cristal,
      }, { onConflict: 'match_id,player_id' })
    }

    setSaved(true)
    setLoading(false)
    setTimeout(() => { setSaved(false); router.push('/admin'); router.refresh() }, 1500)
  }

  const team1Players = players.filter(p => p.team === 1)
  const team2Players = players.filter(p => p.team === 2)

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
        <h1 className="text-xl font-bold">Resultado del partido</h1>
      </div>

      {!matchId ? (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Sets */}
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-4">Marcador</p>

            {/* Header equipos */}
            <div className="grid grid-cols-[1fr_2.5rem_0.5rem_2.5rem] gap-2 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>Equipo</span>
              <span className="text-center" style={{ color: 'var(--accent)' }}>
                {team1Players.map(p => p.name).join(' & ')}
              </span>
              <span />
              <span className="text-center" style={{ color: 'var(--orange)' }}>
                {team2Players.map(p => p.name).join(' & ')}
              </span>
            </div>

            <div className="space-y-2">
              {sets.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_2.5rem_0.5rem_2.5rem] gap-2 items-center">
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Set {i + 1}</span>
                  <input type="number" min={0} max={7} value={s.t1}
                    onChange={e => setScore(i, 't1', e.target.value)}
                    className="text-center rounded-lg py-2 text-sm font-bold outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <span className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>-</span>
                  <input type="number" min={0} max={7} value={s.t2}
                    onChange={e => setScore(i, 't2', e.target.value)}
                    className="text-center rounded-lg py-2 text-sm font-bold outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                </div>
              ))}
            </div>

            <button type="button" onClick={toggleThirdSet}
              className="mt-3 text-xs px-3 py-1.5 rounded-lg transition hover:opacity-80"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {hasThirdSet ? '− Quitar 3.º set' : '+ Añadir 3.º set'}
            </button>

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

          {/* Stats individuales */}
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-4">Estadísticas individuales</p>
            <div className="space-y-5">
              {players.map(player => {
                const st = stats[player.id] ?? { aces: 0, double_faults: 0, bolas_por_3: 0, smash_al_cristal: 0 }
                return (
                  <div key={player.id}>
                    <p className="text-sm font-medium mb-2" style={{ color: player.team === 1 ? 'var(--accent)' : 'var(--orange)' }}>
                      {player.name}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        { key: 'aces', label: '🎯 Aces' },
                        { key: 'double_faults', label: '❌ DF' },
                        { key: 'bolas_por_3', label: '🎱 B×3' },
                        { key: 'smash_al_cristal', label: '💥 SC' },
                      ] as const).map(({ key, label }) => (
                        <div key={key} className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</label>
                          <div className="flex items-center gap-0.5">
                            <button type="button"
                              onClick={() => setStat(player.id, key, (st[key] ?? 0) - 1)}
                              className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
                              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>−</button>
                            <span className="w-6 text-center text-sm font-bold">{st[key] ?? 0}</span>
                            <button type="button"
                              onClick={() => setStat(player.id, key, (st[key] ?? 0) + 1)}
                              className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
                              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <button type="submit" disabled={loading || !winner}
            className="w-full py-3 rounded-xl font-semibold transition hover:opacity-90 disabled:opacity-40"
            style={{ background: saved ? 'var(--green)' : 'var(--accent)', color: '#fff' }}>
            {!winner ? 'Completa el marcador primero' :
              loading ? 'Guardando...' :
                saved ? '✓ Guardado' : 'Guardar resultado + stats'}
          </button>
        </form>
      )}
    </div>
  )
}
