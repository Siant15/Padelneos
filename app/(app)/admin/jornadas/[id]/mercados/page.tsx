'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import type { BettingMarket, BettingOption, BettingQuestionTemplate, Profile } from '@/lib/types'
import AddQuestionPicker from '@/components/AddQuestionPicker'
import { revalidateLigaData } from '@/lib/actions'

type MarketWithAll = BettingMarket & {
  options: (BettingOption & { player?: Profile })[]
  bets: { player_id: string; option_id: string; chips: number }[]
  template?: BettingQuestionTemplate
}

export default function MercadosPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const roundId = params.id as string

  const [markets, setMarkets] = useState<MarketWithAll[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [roundStatus, setRoundStatus] = useState('')
  const [catalog, setCatalog] = useState<BettingQuestionTemplate[]>([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [voiding, setVoiding] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [autoResolving, setAutoResolving] = useState(false)
  const [payoutError, setPayoutError] = useState('')
  const [resolveError, setResolveError] = useState('')
  const [payoutsCalculated, setPayoutsCalculated] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [isSettled, setIsSettled] = useState(false)

  const loadData = useCallback(async () => {
    const [{ data: m, error: marketsError }, { data: p }, { data: r }, { data: settlement }, { data: allTemplates }] = await Promise.all([
      supabase.from('betting_markets')
        .select('*, options:betting_options!market_id(*, player:profiles(id, name)), bets(*), template:betting_question_templates(*)')
        .eq('round_id', roundId)
        .order('created_at'),
      supabase.from('profiles').select('*').order('name'),
      supabase.from('rounds').select('status, round_number, season_id').eq('id', roundId).single(),
      supabase.from('round_settlements').select('id').eq('round_id', roundId).is('voided_at', null).maybeSingle(),
      supabase.from('betting_question_templates').select('*').eq('active', true).order('text'),
    ])
    setLoadError(marketsError ? 'No se pudieron cargar las apuestas: ' + marketsError.message : '')
    const marketRows = (m as MarketWithAll[]) ?? []
    setMarkets(marketRows)
    setPlayers((p as Profile[]) ?? [])
    setRoundStatus(r?.status ?? '')
    setIsSettled(!!settlement)

    const usedTemplateIds = new Set(marketRows.map(mr => mr.template_id).filter(Boolean))
    setCatalog(((allTemplates as BettingQuestionTemplate[]) ?? []).filter(t => !usedTemplateIds.has(t.id)))
  }, [roundId])

  useEffect(() => { loadData() }, [loadData])

  async function deleteMarket(marketId: string) {
    if (!confirm('¿Borrar esta pregunta? Se perderán las fichas jugadas en ella.')) return
    setDeleting(marketId)
    const { error } = await supabase.from('betting_markets').delete().eq('id', marketId)
    setDeleting(null)
    if (error) {
      setLoadError('No se pudo borrar la pregunta: ' + error.message)
      return
    }
    await loadData()
  }

  async function resolveMarket(market: MarketWithAll, winningOptionId: string) {
    setResolving(market.id)
    setResolveError('')
    const { error } = await supabase.from('betting_markets').update({
      resolved: true,
      voided: false,
      winning_option_id: winningOptionId,
    }).eq('id', market.id)
    if (error) setResolveError('No se pudo resolver la pregunta: ' + error.message)
    await loadData()
    setResolving(null)
  }

  async function voidMarket(market: MarketWithAll) {
    if (!confirm('¿Anular esta pregunta? Se devolverán las fichas a todo el que apostó y no genera jackpot.')) return
    setVoiding(market.id)
    setResolveError('')
    const { error } = await supabase.from('betting_markets').update({
      resolved: true,
      voided: true,
      winning_option_id: null,
    }).eq('id', market.id)
    if (error) setResolveError('No se pudo anular la pregunta: ' + error.message)
    await loadData()
    setVoiding(null)
  }

  async function runAutoResolve() {
    setAutoResolving(true)
    setResolveError('')
    const { error } = await supabase.rpc('auto_resolve_round_markets', { p_round_id: roundId })
    setAutoResolving(false)
    if (error) setResolveError('No se pudieron resolver las preguntas automáticas: ' + error.message)
    await loadData()
  }

  async function calcAllPayouts() {
    if (!confirm(isSettled
      ? '¿Volver a liquidar? Se deshace el reparto anterior (incluidos los jackpots que tocara) y se recalcula desde cero.'
      : '¿Calcular premios y puntos ahora? Esto reparte las fichas y asigna los puntos de apuestas de la jornada.')) return
    setCalculating(true)
    setPayoutError('')
    const { error } = await supabase.rpc('settle_round', { p_round_id: roundId })
    setCalculating(false)
    if (error) {
      setPayoutError('No se pudo liquidar la jornada: ' + error.message)
      return
    }
    await revalidateLigaData()
    setPayoutsCalculated(true)
    setIsSettled(true)
    setTimeout(() => setPayoutsCalculated(false), 3000)
  }

  const automaticMarkets = markets.filter(m => m.template?.category === 'automatic')
  const anecdotalMarkets = markets.filter(m => m.template?.category !== 'automatic')
  const allResolved = markets.length > 0 && markets.every(m => m.resolved)
  const pendingAutomatic = automaticMarkets.some(m => !m.resolved)

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</button>
          <h1 className="text-xl font-bold">Acta y apuestas 🎰</h1>
        </div>
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {showNewForm ? '✕ Cancelar' : '+ Plantilla nueva'}
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>⚠ {loadError}</div>
      )}
      {resolveError && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>⚠ {resolveError}</div>
      )}

      {showNewForm && (
        <NewTemplateForm
          roundId={roundId}
          onSaved={() => { setShowNewForm(false); loadData() }}
        />
      )}

      {!markets.length ? (
        <div className="rounded-xl p-5 text-center text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          Esta jornada todavía no tiene preguntas de apuestas.
        </div>
      ) : (
        <>
          {automaticMarkets.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold">🤖 Automáticas</h2>
                {pendingAutomatic && (
                  <button onClick={runAutoResolve} disabled={autoResolving}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-40"
                    style={{ background: 'var(--surface2)', color: 'var(--accent)' }}>
                    {autoResolving ? '...' : 'Resolver desde el resultado'}
                  </button>
                )}
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Se resuelven solas en cuanto se guarda el resultado del partido.
              </p>
              <div className="space-y-4">
                {automaticMarkets.map(market => (
                  <MarketCard key={market.id} market={market} readOnly onDelete={() => deleteMarket(market.id)} deleting={deleting === market.id} />
                ))}
              </div>
            </section>
          )}

          {anecdotalMarkets.length > 0 && (
            <section>
              <h2 className="text-sm font-bold mb-2">📋 Acta del partido</h2>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Estas se resuelven a mano: elige quién/qué pasó, marca &quot;Ninguno&quot; si no ocurrió, o anula si no se puede saber.
              </p>
              <div className="space-y-4">
                {anecdotalMarkets.map(market => (
                  <MarketCard
                    key={market.id}
                    market={market}
                    resolving={resolving === market.id}
                    voiding={voiding === market.id}
                    deleting={deleting === market.id}
                    onResolve={optId => resolveMarket(market, optId)}
                    onVoid={() => voidMarket(market)}
                    onDelete={() => deleteMarket(market.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {roundStatus !== 'played' && catalog.length > 0 && (
        <AddQuestionPicker roundId={roundId} templates={catalog} />
      )}

      {allResolved && (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: `1px solid ${isSettled ? 'var(--border)' : 'var(--green)'}` }}>
          <p className="text-sm font-semibold mb-1" style={{ color: isSettled ? 'var(--text)' : 'var(--green)' }}>
            {isSettled ? '✓ Jornada liquidada' : '✓ Todas las preguntas resueltas o anuladas'}
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            {isSettled
              ? 'Si corriges un resultado, vuelve a pulsar aquí: se deshace lo anterior y se liquida de nuevo.'
              : 'Calcula los premios finales (con jackpot si tocaba) y asigna los puntos de clasificación.'}
          </p>
          {payoutError && <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>⚠ {payoutError}</p>}
          <button
            onClick={calcAllPayouts}
            disabled={calculating}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ background: payoutsCalculated ? 'var(--green)' : 'var(--accent)', color: '#fff' }}>
            {calculating ? 'Liquidando...' : payoutsCalculated ? '✓ Liquidada' : isSettled ? '↻ Volver a liquidar' : '🏆 Calcular premios y puntos'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Tarjeta de pregunta ───────────────────────────────────────
function MarketCard({ market, resolving, voiding, deleting, readOnly, onResolve, onVoid, onDelete }: {
  market: MarketWithAll
  resolving?: boolean
  voiding?: boolean
  deleting: boolean
  readOnly?: boolean
  onResolve?: (optId: string) => void
  onVoid?: () => void
  onDelete: () => void
}) {
  const [selectedOption, setSelectedOption] = useState('')

  const totalChipsPerOption = (optId: string) =>
    market.bets.filter(b => b.option_id === optId).reduce((s, b) => s + b.chips, 0)

  const totalPot = market.bets.reduce((s, b) => s + b.chips, 0)
  const noneOption = market.options?.find(o => o.is_none)

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: `1px solid ${market.voided ? 'var(--text-muted2)' : market.resolved ? 'var(--green)' : 'var(--border)'}` }}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
          {market.type}
        </span>
        <div className="flex items-center gap-2">
          {market.voided
            ? <span className="text-xs font-semibold" style={{ color: 'var(--text-muted2)' }}>Anulada</span>
            : market.resolved
              ? <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>✓ Resuelta</span>
              : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{totalPot} fichas en juego</span>
          }
          {!readOnly && !market.resolved && totalPot === 0 && (
            <button onClick={onDelete} disabled={deleting} aria-label="Borrar pregunta"
              className="text-xs px-1.5 disabled:opacity-40" style={{ color: 'var(--red)' }}>
              {deleting ? '...' : '🗑️'}
            </button>
          )}
        </div>
      </div>

      <p className="font-semibold text-sm mb-3">{market.description}</p>

      <div className="space-y-1.5 mb-3">
        {market.options?.filter(o => !o.is_none).map(opt => {
          const chips = totalChipsPerOption(opt.id)
          const isWinner = market.winning_option_id === opt.id
          return (
            <div key={opt.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: isWinner ? 'rgba(34,197,94,0.1)' : 'var(--surface2)', border: `1px solid ${isWinner ? 'var(--green)' : 'var(--border)'}` }}>
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
        {noneOption && market.winning_option_id === noneOption.id && (
          <div className="px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--green)' }}>
            🏆 Ninguno ocurrió
          </div>
        )}
      </div>

      {!readOnly && !market.resolved && (
        <div className="pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>¿Qué pasó?</p>
          <div className="flex gap-2">
            <select
              value={selectedOption}
              onChange={e => setSelectedOption(e.target.value)}
              className="flex-1 text-sm rounded-lg px-3 py-2 outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <option value="">Seleccionar...</option>
              {market.options?.filter(o => !o.is_none).map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <button
              disabled={!selectedOption || resolving}
              onClick={() => onResolve?.(selectedOption)}
              className="px-3 py-2 rounded-lg text-sm font-semibold transition hover:opacity-80 disabled:opacity-40"
              style={{ background: 'var(--green)', color: '#fff' }}>
              {resolving ? '...' : 'Resolver'}
            </button>
          </div>
          <div className="flex gap-2">
            {noneOption && (
              <button onClick={() => onResolve?.(noneOption.id)} disabled={resolving}
                className="flex-1 text-xs font-semibold py-2 rounded-lg disabled:opacity-40"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                Ninguno ocurrió
              </button>
            )}
            <button onClick={onVoid} disabled={voiding}
              className="flex-1 text-xs font-semibold py-2 rounded-lg disabled:opacity-40"
              style={{ background: 'var(--orange-bg)', color: '#7A5A1E' }}>
              {voiding ? '...' : 'Anular (devolver fichas)'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Formulario de plantilla nueva ─────────────────────────────
function NewTemplateForm({ roundId, onSaved }: { roundId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [category, setCategory] = useState<'automatic' | 'anecdotal'>('anecdotal')
  const [answerType, setAnswerType] = useState<'player' | 'yes_no' | 'custom_options'>('player')
  const [text, setText] = useState('')
  const [allowNone, setAllowNone] = useState(true)
  const [autoApply, setAutoApply] = useState(false)
  const [customOptions, setCustomOptions] = useState(['', ''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateOption(i: number, v: string) {
    setCustomOptions(prev => prev.map((o, j) => j === i ? v : o))
  }

  async function handleCreate() {
    if (!text.trim()) return
    setSaving(true)
    setError('')

    const { data: template, error: templateError } = await supabase
      .from('betting_question_templates')
      .insert({
        text: text.trim(),
        category,
        answer_type: answerType,
        allow_none: answerType === 'custom_options' ? false : allowNone,
        auto_apply: autoApply,
        active: true,
        options: answerType === 'custom_options'
          ? customOptions.filter(o => o.trim()).map(o => ({ label: o.trim(), value: o.trim() }))
          : null,
      })
      .select()
      .single()

    if (templateError || !template) {
      setError('No se pudo crear la plantilla: ' + (templateError?.message ?? 'error desconocido'))
      setSaving(false)
      return
    }

    const { error: instantiateError } = await supabase.rpc('instantiate_round_questions', {
      p_round_id: roundId,
      p_template_ids: [template.id],
    })
    setSaving(false)
    if (instantiateError) {
      setError('La plantilla se creó, pero no se pudo añadir a esta jornada: ' + instantiateError.message)
      return
    }
    onSaved()
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--accent)' }}>
      <p className="text-sm font-semibold mb-1">Nueva plantilla de pregunta</p>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Se guarda para poder reutilizarla en futuras jornadas (desde &quot;Añadir más&quot;).
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>¿Se resuelve sola o a mano?</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setCategory('anecdotal')}
              className="py-2 rounded-lg text-xs font-semibold transition"
              style={{ background: category === 'anecdotal' ? 'var(--accent)' : 'var(--surface)', color: category === 'anecdotal' ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
              A mano (acta)
            </button>
            <button type="button" onClick={() => setCategory('automatic')} disabled
              title="Solo las plantillas del sistema se resuelven automáticamente"
              className="py-2 rounded-lg text-xs font-semibold opacity-40" style={{ border: '1px solid var(--border)' }}>
              Automática
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Tipo de respuesta</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: 'player', label: 'Jugador' },
              { v: 'yes_no', label: 'Sí / No' },
              { v: 'custom_options', label: 'Opciones' },
            ] as const).map(({ v, label }) => (
              <button key={v} type="button" onClick={() => setAnswerType(v)}
                className="py-2 rounded-lg text-xs font-semibold transition"
                style={{ background: answerType === v ? 'var(--accent)' : 'var(--surface)', color: answerType === v ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Texto de la pregunta</label>
          <input
            type="text"
            placeholder="Ej: Primero en dejar el móvil en la pista"
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        {answerType === 'custom_options' && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Opciones</label>
            <div className="flex flex-wrap gap-2">
              {customOptions.map((o, i) => (
                <input key={i} type="text" value={o} onChange={e => updateOption(i, e.target.value)}
                  className="w-24 text-center text-xs rounded-lg px-2 py-1.5 outline-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              ))}
              <button type="button" onClick={() => setCustomOptions(prev => [...prev, ''])}
                className="text-xs px-3 py-1.5 rounded-lg" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>+</button>
            </div>
          </div>
        )}

        {answerType === 'player' && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>🚫 Nadie podrá apostar por sí mismo en esta pregunta.</p>
        )}

        {answerType !== 'custom_options' && (
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={allowNone} onChange={e => setAllowNone(e.target.checked)} />
            Incluir opción &quot;Ninguno / no ocurrió&quot;
          </label>
        )}

        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={autoApply} onChange={e => setAutoApply(e.target.checked)} />
          Aplicar sola a todas las jornadas futuras
        </label>

        {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

        <button onClick={handleCreate} disabled={saving || !text.trim()}
          className="w-full py-2.5 rounded-lg font-semibold text-sm transition hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {saving ? 'Creando...' : 'Crear y añadir a esta jornada'}
        </button>
      </div>
    </div>
  )
}
