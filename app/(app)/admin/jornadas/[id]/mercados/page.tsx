'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import type { BettingMarket, BettingOption, Profile } from '@/lib/types'

type MarketWithAll = BettingMarket & {
  options: (BettingOption & { player?: Profile })[]
  bets: { player_id: string; option_id: string; chips: number }[]
}

// ─── Cálculo pari-mutuel (reparto exacto por método del mayor resto) ──
function calcPayouts(market: MarketWithAll): Record<string, number> {
  if (!market.winning_option_id) return {}

  const totalPot = market.bets.reduce((s, b) => s + b.chips, 0)
  const winnerBets = market.bets.filter(b => b.option_id === market.winning_option_id)
  const winnerTotal = winnerBets.reduce((s, b) => s + b.chips, 0)

  const nets: Record<string, number> = {}
  for (const bet of market.bets) {
    nets[bet.player_id] = (nets[bet.player_id] ?? 0) - bet.chips
  }

  if (winnerTotal > 0) {
    const shares = winnerBets.map(bet => {
      const raw = (bet.chips / winnerTotal) * totalPot
      const floor = Math.floor(raw)
      return { playerId: bet.player_id, floor, remainder: raw - floor }
    })
    const distributed = shares.reduce((s, x) => s + x.floor, 0)
    const leftover = totalPot - distributed
    const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder)
    for (let i = 0; i < leftover; i++) {
      byRemainder[i % byRemainder.length].floor += 1
    }
    for (const s of shares) {
      nets[s.playerId] = (nets[s.playerId] ?? 0) + s.floor
    }
  }

  return nets
}

async function resolveRoundPayouts(supabase: ReturnType<typeof createClient>, roundId: string): Promise<string | null> {
  const { data: markets, error: fetchError } = await supabase
    .from('betting_markets')
    .select('*, bets(*)')
    .eq('round_id', roundId)
    .eq('resolved', true)
    .not('winning_option_id', 'is', null)

  if (fetchError) return 'No se pudieron leer las apuestas: ' + fetchError.message
  if (!markets?.length) return 'No hay apuestas resueltas todavía.'

  const playerNets: Record<string, number> = {}
  for (const m of markets as MarketWithAll[]) {
    const nets = calcPayouts(m)
    for (const [pid, net] of Object.entries(nets)) {
      playerNets[pid] = (playerNets[pid] ?? 0) + net
    }
  }

  const ranked = Object.entries(playerNets).sort((a, b) => b[1] - a[1])
  const bonuses = [1, 0.5, 0, 0]
  const rows = ranked.map(([playerId, chipsNet], i) => ({
    round_id: roundId,
    player_id: playerId,
    chips_net: chipsNet,
    point_bonus: bonuses[i] ?? 0,
    rank: i + 1,
  }))

  const { error } = await supabase.from('betting_round_results').upsert(rows, { onConflict: 'round_id,player_id' })
  return error ? 'No se pudo guardar el resultado: ' + error.message : null
}

export default function MercadosPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const roundId = params.id as string

  const [markets, setMarkets] = useState<MarketWithAll[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [roundStatus, setRoundStatus] = useState('')
  const [previousRoundId, setPreviousRoundId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [payoutError, setPayoutError] = useState('')
  const [resolveError, setResolveError] = useState('')
  const [payoutsCalculated, setPayoutsCalculated] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [loadError, setLoadError] = useState('')

  const loadData = useCallback(async () => {
    const [{ data: m, error: marketsError }, { data: p }, { data: r }] = await Promise.all([
      supabase.from('betting_markets')
        .select('*, options:betting_options!market_id(*, player:profiles(id, name)), bets(*)')
        .eq('round_id', roundId)
        .order('created_at'),
      supabase.from('profiles').select('*').order('name'),
      supabase.from('rounds').select('status, round_number, season_id').eq('id', roundId).single(),
    ])
    setLoadError(marketsError ? 'No se pudieron cargar las apuestas: ' + marketsError.message : '')
    setMarkets((m as MarketWithAll[]) ?? [])
    setPlayers((p as Profile[]) ?? [])
    setRoundStatus(r?.status ?? '')

    if (r?.round_number && r.round_number > 1) {
      const { data: prevRound } = await supabase
        .from('rounds')
        .select('id')
        .eq('season_id', r.season_id)
        .eq('round_number', r.round_number - 1)
        .maybeSingle()
      setPreviousRoundId(prevRound?.id ?? null)
    } else {
      setPreviousRoundId(null)
    }
  }, [roundId])

  useEffect(() => { loadData() }, [loadData])

  async function copyFromPreviousRound() {
    if (!previousRoundId) return
    setCopying(true)
    setCopyError('')

    const { data: prevMarkets, error: prevError } = await supabase
      .from('betting_markets')
      .select('type, description, options:betting_options!market_id(label, player_id, value, is_self_negative)')
      .eq('round_id', previousRoundId)

    if (prevError) {
      setCopyError('No se pudieron leer las apuestas de la jornada anterior: ' + prevError.message)
      setCopying(false)
      return
    }
    if (!prevMarkets?.length) {
      setCopyError('La jornada anterior no tenía apuestas.')
      setCopying(false)
      return
    }

    for (const pm of prevMarkets as { type: string; description: string; options: { label: string; player_id: string | null; value: string | null; is_self_negative: boolean }[] }[]) {
      const { data: newMarket, error: marketError } = await supabase
        .from('betting_markets')
        .insert({ round_id: roundId, type: pm.type, description: pm.description })
        .select()
        .single()

      if (marketError || !newMarket) {
        setCopyError('Fallo copiando "' + pm.description + '": ' + (marketError?.message ?? 'error desconocido'))
        setCopying(false)
        await loadData()
        return
      }

      const options = pm.options.map(o => ({
        market_id: newMarket.id,
        label: o.label,
        player_id: o.player_id,
        value: o.value,
        is_self_negative: o.is_self_negative,
      }))
      const { error: optionsError } = await supabase.from('betting_options').insert(options)
      if (optionsError) {
        setCopyError('Fallo copiando las opciones de "' + pm.description + '": ' + optionsError.message)
        setCopying(false)
        await loadData()
        return
      }
    }

    setCopying(false)
    await loadData()
  }

  async function deleteMarket(marketId: string) {
    if (!confirm('¿Borrar esta apuesta? Se perderán las fichas jugadas en ella.')) return
    setDeleting(marketId)
    const { error } = await supabase.from('betting_markets').delete().eq('id', marketId)
    setDeleting(null)
    if (error) {
      setLoadError('No se pudo borrar la apuesta: ' + error.message)
      return
    }
    await loadData()
  }

  async function resolveMarket(market: MarketWithAll, winningOptionId: string) {
    if (!confirm('¿Seguro? Una vez resuelta la apuesta no se puede deshacer desde aquí.')) return
    setResolving(market.id)
    setResolveError('')
    const { error } = await supabase.from('betting_markets').update({
      resolved: true,
      winning_option_id: winningOptionId,
    }).eq('id', market.id)
    if (error) setResolveError('No se pudo resolver la apuesta: ' + error.message)
    await loadData()
    setResolving(null)
  }

  async function calcAllPayouts() {
    if (!confirm('¿Calcular premios y puntos ahora? Esto reparte las fichas y asigna los puntos de apuestas de la jornada.')) return
    setCalculating(true)
    setPayoutError('')
    const err = await resolveRoundPayouts(supabase, roundId)
    setCalculating(false)
    if (err) {
      setPayoutError(err)
      return
    }
    setPayoutsCalculated(true)
    setTimeout(() => setPayoutsCalculated(false), 3000)
  }

  const allResolved = markets.length > 0 && markets.every(m => m.resolved)

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
          <h1 className="text-xl font-bold">Apuestas 🎰</h1>
        </div>
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {showNewForm ? '✕ Cancelar' : '+ Apuesta'}
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>
          ⚠ {loadError}
        </div>
      )}
      {resolveError && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>
          ⚠ {resolveError}
        </div>
      )}

      {showNewForm && (
        <NewMarketForm
          roundId={roundId}
          players={players}
          onSaved={() => { setShowNewForm(false); loadData() }}
        />
      )}

      {!markets.length && previousRoundId && (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--accent)' }}>
          <p className="text-sm font-semibold mb-1">📋 ¿Mismas apuestas que la jornada anterior?</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Copia las preguntas de la jornada pasada para no escribirlas otra vez. Si alguna no la quieres esta semana, la borras después con un tap.
          </p>
          {copyError && <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>⚠ {copyError}</p>}
          <button
            onClick={copyFromPreviousRound}
            disabled={copying}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {copying ? 'Copiando...' : '📋 Copiar apuestas de la jornada anterior'}
          </button>
        </div>
      )}

      {/* Apuestas existentes */}
      {!markets.length ? (
        <div className="rounded-xl p-5 text-center text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          No hay apuestas todavía. Crea la primera.
        </div>
      ) : (
        <div className="space-y-4">
          {markets.map(market => (
            <MarketCard
              key={market.id}
              market={market}
              resolving={resolving === market.id}
              deleting={deleting === market.id}
              onResolve={(optId) => resolveMarket(market, optId)}
              onDelete={() => deleteMarket(market.id)}
            />
          ))}
        </div>
      )}

      {/* Calcular payouts */}
      {allResolved && roundStatus === 'played' && (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--green)' }}>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--green)' }}>
            ✓ Todas las apuestas resueltas
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Calcula los premios finales y asigna los puntos de clasificación.
          </p>
          {payoutError && (
            <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>⚠ {payoutError}</p>
          )}
          <button
            onClick={calcAllPayouts}
            disabled={calculating}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ background: payoutsCalculated ? 'var(--green)' : 'var(--accent)', color: '#fff' }}>
            {calculating ? 'Calculando...' : payoutsCalculated ? '✓ Payouts calculados' : '🏆 Calcular premios y puntos'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Tarjeta de mercado ───────────────────────────────────────
function MarketCard({ market, resolving, deleting, onResolve, onDelete }: {
  market: MarketWithAll
  resolving: boolean
  deleting: boolean
  onResolve: (optId: string) => void
  onDelete: () => void
}) {
  const [selectedOption, setSelectedOption] = useState('')

  const totalChipsPerOption = (optId: string) =>
    market.bets.filter(b => b.option_id === optId).reduce((s, b) => s + b.chips, 0)

  const totalPot = market.bets.reduce((s, b) => s + b.chips, 0)

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: `1px solid ${market.resolved ? 'var(--green)' : 'var(--border)'}` }}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
          {market.type === 'yes_no' ? 'Sí/No' : market.type === 'player_choice' ? 'Jugador' : 'Cantidad'}
        </span>
        <div className="flex items-center gap-2">
          {market.resolved
            ? <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>✓ Resuelta</span>
            : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{totalPot} fichas en juego</span>
          }
          {!market.resolved && totalPot === 0 && (
            <button
              onClick={onDelete}
              disabled={deleting}
              aria-label="Borrar apuesta"
              className="text-xs px-1.5 disabled:opacity-40"
              style={{ color: 'var(--red)' }}>
              {deleting ? '...' : '🗑️'}
            </button>
          )}
        </div>
      </div>

      <p className="font-semibold text-sm mb-3">{market.description}</p>

      <div className="space-y-1.5 mb-3">
        {market.options?.map(opt => {
          const chips = totalChipsPerOption(opt.id)
          const isWinner = market.winning_option_id === opt.id
          return (
            <div
              key={opt.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{
                background: isWinner ? 'rgba(34,197,94,0.1)' : 'var(--surface2)',
                border: `1px solid ${isWinner ? 'var(--green)' : 'var(--border)'}`,
              }}
            >
              <span className="text-sm">
                {isWinner && '🏆 '}{opt.label}
                {opt.is_self_negative && <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>🚫 auto-apuesta</span>}
              </span>
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                {chips} fichas ({totalPot > 0 ? Math.round(chips / totalPot * 100) : 0}%)
              </span>
            </div>
          )
        })}
      </div>

      {/* Resolver */}
      {!market.resolved && (
        <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>¿Qué opción ganó?</p>
          <div className="flex gap-2">
            <select
              value={selectedOption}
              onChange={e => setSelectedOption(e.target.value)}
              className="flex-1 text-sm rounded-lg px-3 py-2 outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <option value="">Seleccionar resultado...</option>
              {market.options?.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <button
              disabled={!selectedOption || resolving}
              onClick={() => onResolve(selectedOption)}
              className="px-3 py-2 rounded-lg text-sm font-semibold transition hover:opacity-80 disabled:opacity-40"
              style={{ background: 'var(--green)', color: '#fff' }}>
              {resolving ? '...' : 'Resolver'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Formulario nuevo mercado ─────────────────────────────────
function NewMarketForm({ roundId, players, onSaved }: {
  roundId: string
  players: Profile[]
  onSaved: () => void
}) {
  const supabase = createClient()
  const [type, setType] = useState<'yes_no' | 'player_choice' | 'quantity'>('yes_no')
  const [description, setDescription] = useState('')
  const [quantityOptions, setQuantityOptions] = useState(['0', '1', '2', '3+'])
  const [closesAt, setClosesAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateQtyOption(i: number, v: string) {
    setQuantityOptions(prev => prev.map((o, j) => j === i ? v : o))
  }

  async function handleCreate() {
    if (!description.trim()) return
    setSaving(true)
    setError('')

    const { data: market, error: marketError } = await supabase
      .from('betting_markets')
      .insert({
        round_id: roundId,
        type,
        description: description.trim(),
        closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      })
      .select()
      .single()

    if (marketError || !market) {
      setError('No se pudo crear la apuesta: ' + (marketError?.message ?? 'error desconocido'))
      setSaving(false)
      return
    }

    let options: { market_id: string; label: string; player_id?: string | null; value?: string | null; is_self_negative?: boolean }[] = []

    if (type === 'yes_no') {
      options = [
        { market_id: market.id, label: 'Sí', value: 'yes' },
        { market_id: market.id, label: 'No', value: 'no' },
      ]
    } else if (type === 'player_choice') {
      // Nadie puede apostar por sí mismo en una pregunta sobre jugadores.
      options = players.map(p => ({ market_id: market.id, label: p.name, player_id: p.id, is_self_negative: true }))
    } else {
      options = quantityOptions.filter(o => o.trim()).map(o => ({ market_id: market.id, label: o, value: o }))
    }

    const { error: optionsError } = await supabase.from('betting_options').insert(options)
    if (optionsError) {
      setError('La apuesta se creó pero las opciones fallaron: ' + optionsError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--accent)' }}>
      <p className="text-sm font-semibold mb-4">Nueva apuesta</p>

      <div className="space-y-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Tipo</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: 'yes_no', label: 'Sí / No' },
              { v: 'player_choice', label: 'Jugador' },
              { v: 'quantity', label: 'Cantidad' },
            ] as const).map(({ v, label }) => (
              <button key={v} type="button" onClick={() => setType(v)}
                className="py-2 rounded-lg text-xs font-semibold transition"
                style={{
                  background: type === v ? 'var(--accent)' : 'var(--surface)',
                  color: type === v ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Descripción / pregunta</label>
          <input
            type="text"
            placeholder={
              type === 'yes_no' ? '¿Habrá tercer set?' :
                type === 'player_choice' ? '¿Quién hará más aces?' :
                  '¿Cuántas bolas por 3 habrá en total?'
            }
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
            Cierre de apuestas (opcional)
          </label>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={e => setClosesAt(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Si lo dejas vacío, se puede apostar hasta la hora del partido (la hora habitual de la temporada).
          </p>
        </div>

        {type === 'player_choice' && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            🚫 Nadie podrá apostar por sí mismo en esta pregunta.
          </p>
        )}

        {/* Vista previa de opciones */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Opciones que se crearán</label>
          {type === 'yes_no' && (
            <div className="flex gap-2">
              {['Sí', 'No'].map(o => (
                <span key={o} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>{o}</span>
              ))}
            </div>
          )}
          {type === 'player_choice' && (
            <div className="flex flex-wrap gap-2">
              {players.map(p => (
                <span key={p.id} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>{p.name}</span>
              ))}
            </div>
          )}
          {type === 'quantity' && (
            <div className="flex flex-wrap gap-2">
              {quantityOptions.map((o, i) => (
                <input key={i} type="text" value={o}
                  onChange={e => updateQtyOption(i, e.target.value)}
                  className="w-14 text-center text-xs rounded-lg px-2 py-1.5 outline-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              ))}
              <button type="button"
                onClick={() => setQuantityOptions(prev => [...prev, ''])}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>+</button>
            </div>
          )}
        </div>

        {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

        <button onClick={handleCreate} disabled={saving || !description.trim()}
          className="w-full py-2.5 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {saving ? 'Creando...' : 'Crear apuesta'}
        </button>
      </div>
    </div>
  )
}
