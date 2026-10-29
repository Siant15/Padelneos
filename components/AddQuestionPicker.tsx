'use client'

import { useState } from 'react'
import { ArrowUp, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingQuestionTemplate } from '@/lib/types'
import { revalidateLigaData } from '@/lib/actions'
import { friendlyError } from '@/lib/errors'

type CustomAnswerType = 'pair' | 'player' | 'yes_no' | 'custom_options'

const ANSWER_TYPES: { value: CustomAnswerType; label: string; hint: string }[] = [
  { value: 'pair', label: '👥 Una pareja', hint: 'Se apuesta por una de las dos parejas del partido' },
  { value: 'player', label: '🎾 Un jugador', hint: 'Se apuesta por uno de los 4 jugadores' },
  { value: 'yes_no', label: '✅ Sí o no', hint: 'Pasa o no pasa' },
  { value: 'custom_options', label: '✏️ Otras opciones', hint: 'Escribes tú las respuestas posibles' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 10,
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 16,
  outline: 'none',
}

const MAX_PAID_QUESTIONS = 10
// Cuántas preguntas extra se ofrecen a la vez (las más usadas primero).
const MAX_EXTRA_QUESTIONS = 6

// Catálogo de preguntas que no se aplican solas a cada jornada
// (auto_apply = false): cualquier jugador puede añadirlas aquí para
// no saturar la interfaz por defecto. También se puede crear una
// pregunta totalmente nueva: se guarda en el catálogo (para poder
// reutilizarla en futuras jornadas) y se aplica a esta a la vez.
// Entre 6 y 10 preguntas de pago por jornada (el marcador exacto no cuenta).
export default function AddQuestionPicker({ roundId, templates, paidCount, jackpotByTemplate = {} }: { roundId: string; templates: BettingQuestionTemplate[]; paidCount: number; jackpotByTemplate?: Record<string, number> }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [creating, setCreating] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [text, setText] = useState('')
  const [answerType, setAnswerType] = useState<CustomAnswerType>('yes_no')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [allowNone, setAllowNone] = useState(false)
  const [savingCustom, setSavingCustom] = useState(false)

  const [answerFor, setAnswerFor] = useState<BettingQuestionTemplate | null>(null)
  const [answerTexts, setAnswerTexts] = useState<string[]>([])
  const [playerChoices, setPlayerChoices] = useState<{ id: string; name: string; checked: boolean }[]>([])
  const [includeNone, setIncludeNone] = useState(false)
  const [loadingPlayers, setLoadingPlayers] = useState(false)

  const atLimit = paidCount >= MAX_PAID_QUESTIONS

  // Las preguntas con jackpot acumulado (nadie acertó la última vez) van primero:
  // es lo que más interesa al elegir, y así no quedan fuera del recorte de 6.
  const visibleTemplates = [...templates]
    .sort((a, b) => Number((jackpotByTemplate[b.id] ?? 0) > 0) - Number((jackpotByTemplate[a.id] ?? 0) > 0))
    .slice(0, MAX_EXTRA_QUESTIONS)

  function startEdit(t: BettingQuestionTemplate) {
    setEditingId(t.id)
    setEditText(t.text)
  }

  async function saveEdit(templateId: string) {
    if (!editText.trim()) return
    if (!window.confirm('Este texto es del catálogo compartido: el cambio se aplicará a esta jornada y a las futuras que usen esta misma pregunta (nunca a jornadas ya jugadas). ¿Continuar?')) return
    setSavingEdit(true)
    setError('')
    const { error: updateError } = await supabase.rpc('update_template_text', { p_template_id: templateId, p_text: editText.trim() })
    setSavingEdit(false)
    if (updateError) {
      setError(friendlyError(updateError.message, 'No se pudo guardar el cambio. Inténtalo de nuevo.'))
      return
    }
    setEditingId(null)
    await revalidateLigaData()
    router.refresh()
  }

  async function addTemplate(templateId: string) {
    if (atLimit) return
    setAdding(templateId)
    setError('')
    const { error: rpcError } = await supabase.rpc('instantiate_round_questions', {
      p_round_id: roundId,
      p_template_ids: [templateId],
    })
    setAdding(null)
    if (rpcError) {
      setError(friendlyError(rpcError.message, 'No se pudo añadir la pregunta. Inténtalo de nuevo.'))
      return
    }
    await revalidateLigaData()
    router.refresh()
  }

  // Popup de respuestas: solo para preguntas cuyas respuestas tiene
  // sentido elegir (jugadores, sí/no, opciones propias). Las demás
  // (ganador, resultado por sets...) se resuelven solas a partir del
  // marcador y se añaden directamente.
  async function startAdd(t: BettingQuestionTemplate) {
    if (atLimit) return
    if (t.answer_type !== 'player' && t.answer_type !== 'yes_no' && t.answer_type !== 'custom_options') {
      await addTemplate(t.id)
      return
    }
    setError('')
    setAnswerFor(t)
    if (t.answer_type === 'player') {
      setLoadingPlayers(true)
      const { data } = await supabase
        .from('matches')
        .select('team1_p1:profiles!team1_p1_id(id, name), team1_p2:profiles!team1_p2_id(id, name), team2_p1:profiles!team2_p1_id(id, name), team2_p2:profiles!team2_p2_id(id, name)')
        .eq('round_id', roundId)
        .maybeSingle()
      setLoadingPlayers(false)
      const m = data as unknown as Record<string, { id: string; name: string } | null> | null
      const players = m ? [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].filter((p): p is { id: string; name: string } => !!p) : []
      setPlayerChoices(players.map(p => ({ ...p, checked: true })))
      setIncludeNone(t.allow_none)
    } else if (t.answer_type === 'yes_no') {
      setAnswerTexts(['Sí', 'No'])
    } else {
      const labels = (t.options ?? []).map(o => o.label)
      setAnswerTexts(labels.length >= 2 ? labels : [...labels, ...Array(2 - labels.length).fill('')])
    }
  }

  async function confirmAnswers() {
    if (!answerFor) return
    let payload: { label: string; value?: string; player_id?: string; is_none?: boolean }[]
    if (answerFor.answer_type === 'player') {
      payload = playerChoices.filter(p => p.checked).map(p => ({ label: p.name, player_id: p.id }))
      if (includeNone) payload.push({ label: 'Ninguno', value: 'none', is_none: true })
    } else if (answerFor.answer_type === 'yes_no') {
      payload = [{ label: answerTexts[0].trim() || 'Sí', value: 'yes' }, { label: answerTexts[1].trim() || 'No', value: 'no' }]
    } else {
      payload = answerTexts.map(a => a.trim()).filter(Boolean).map(a => ({ label: a, value: a }))
    }
    if (payload.length < 2) {
      setError('Hacen falta al menos 2 respuestas.')
      return
    }
    setAdding(answerFor.id)
    setError('')
    const { error: rpcError } = await supabase.rpc('add_round_question_with_options', {
      p_round_id: roundId,
      p_template_id: answerFor.id,
      p_options: payload,
    })
    setAdding(null)
    if (rpcError) {
      setError(friendlyError(rpcError.message, 'No se pudo añadir la pregunta. Inténtalo de nuevo.'))
      return
    }
    setAnswerFor(null)
    await revalidateLigaData()
    router.refresh()
  }

  async function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || atLimit) return
    if (createStep === 1) { setCreateStep(2); return }
    if (answerType === 'custom_options' && options.filter(o => o.trim()).length < 2) {
      setError('Añade al menos 2 opciones.')
      return
    }
    setSavingCustom(true)
    setError('')

    const { data: newTemplate, error: insertError } = await supabase
      .from('betting_question_templates')
      .insert({
        text: text.trim(),
        category: 'anecdotal',
        answer_type: answerType,
        resolution_key: null,
        options: answerType === 'custom_options'
          ? options.filter(o => o.trim()).map(o => ({ label: o.trim(), value: o.trim() }))
          : null,
        allow_none: (answerType === 'player' || answerType === 'custom_options') && allowNone,
        auto_apply: false,
        active: true,
      })
      .select('id')
      .single()

    if (insertError || !newTemplate) {
      setSavingCustom(false)
      setError(friendlyError(insertError?.message, 'No se pudo guardar la pregunta. Inténtalo de nuevo.'))
      return
    }

    const { error: rpcError } = await supabase.rpc('instantiate_round_questions', {
      p_round_id: roundId,
      p_template_ids: [newTemplate.id],
    })
    setSavingCustom(false)
    if (rpcError) {
      setError(friendlyError(rpcError.message, 'La pregunta se guardó en el catálogo, pero no se pudo añadir a esta jornada.'))
      return
    }

    setText(''); setOptions(['', '']); setAllowNone(false); setAnswerType('yes_no'); setCreating(false); setCreateStep(1)
    await revalidateLigaData()
    router.refresh()
  }

  return (
    <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between text-sm font-bold" style={{ color: 'var(--accent)' }}>
        <span>+ Añadir más preguntas</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
          {atLimit && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Esta jornada ya tiene las {MAX_PAID_QUESTIONS} preguntas de pago (máximo).
            </p>
          )}
          {visibleTemplates.map(t => (
            editingId === t.id ? (
              <div key={t.id} className="flex gap-1.5">
                <input value={editText} onChange={e => setEditText(e.target.value)} style={inputStyle} />
                <button onClick={() => saveEdit(t.id)} disabled={savingEdit} className="px-3 text-xs font-bold rounded-lg disabled:opacity-40" style={{ background: 'var(--accent)', color: '#fff' }}>
                  {savingEdit ? '...' : '✓'}
                </button>
                <button onClick={() => setEditingId(null)} className="px-2 text-xs font-bold rounded-lg" style={{ background: 'var(--tint)', color: '#555' }}>✕</button>
              </div>
            ) : (
              <div key={t.id} className="rounded-xl pl-3 pr-1.5 py-1.5 flex items-center gap-1.5" style={{ background: 'var(--surface2)' }}>
                <span className="flex-1 min-w-0 text-xs font-semibold" style={{ color: 'var(--text)' }}>
                  {t.text}
                  {(jackpotByTemplate[t.id] ?? 0) > 0 && (
                    <span className="ml-1.5 whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--orange-bg)', color: 'var(--orange)' }}>
                      🎰 {jackpotByTemplate[t.id]}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => startEdit(t)}
                  aria-label="Modificar pregunta"
                  title="Modificar el texto (afecta a esta jornada y a las futuras, nunca a las ya jugadas)"
                  className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg transition hover:opacity-90"
                  style={{ background: 'var(--tint)', color: '#555' }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => startAdd(t)}
                  disabled={adding === t.id || atLimit}
                  aria-label="Subir a las apuestas"
                  title="Subir a las apuestas de esta jornada"
                  className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {adding === t.id ? '…' : <ArrowUp size={18} />}
                </button>
              </div>
            )
          ))}

          {!creating ? (
            !atLimit && (
              <button
                onClick={() => setCreating(true)}
                className="text-left text-xs font-bold px-3 py-2 rounded-xl transition hover:opacity-90"
                style={{ background: 'var(--tint)', color: 'var(--accent)' }}
              >
                + Crear pregunta personalizada
              </button>
            )
          ) : (
            <form onSubmit={handleCreateCustom} className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: 'var(--surface2)' }}>
              {createStep === 1 ? (
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Ej: ¿Se caerá alguien en pista?"
                  required
                  autoFocus
                  style={inputStyle}
                />
              ) : (
                <>
                  <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>«{text.trim()}»</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>¿Cómo se responde?</p>
                  <div className="flex flex-col gap-1.5">
                    {ANSWER_TYPES.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setAnswerType(t.value)}
                        className="text-left rounded-xl px-3 py-2"
                        style={{
                          background: answerType === t.value ? 'var(--tint)' : 'var(--surface)',
                          border: `1.5px solid ${answerType === t.value ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        <span className="block text-xs font-bold" style={{ color: 'var(--text)' }}>{t.label}</span>
                        <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.hint}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {createStep === 2 && answerType === 'custom_options' && (
                <div className="flex flex-col gap-1.5">
                  {options.map((o, i) => (
                    <div key={i} className="flex gap-1.5">
                      <input
                        value={o}
                        onChange={e => setOptions(opts => opts.map((x, j) => j === i ? e.target.value : x))}
                        placeholder={`Opción ${i + 1}`}
                        style={inputStyle}
                      />
                      {options.length > 2 && (
                        <button type="button" onClick={() => setOptions(opts => opts.filter((_, j) => j !== i))} className="px-2 text-xs font-bold rounded-lg" style={{ background: 'var(--tint)', color: 'var(--red)' }}>
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setOptions(opts => [...opts, ''])} className="text-xs font-bold text-left" style={{ color: 'var(--accent)' }}>
                    + Añadir opción
                  </button>
                </div>
              )}

              {createStep === 2 && (answerType === 'player' || answerType === 'custom_options') && (
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={allowNone} onChange={e => setAllowNone(e.target.checked)} />
                  Permitir la opción &quot;Ninguno&quot;
                </label>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => (createStep === 2 ? setCreateStep(1) : setCreating(false))} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: 'var(--tint)', color: '#555' }}>
                  {createStep === 2 ? 'Atrás' : 'Cancelar'}
                </button>
                <button type="submit" disabled={savingCustom} className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#fff' }}>
                  {createStep === 1 ? 'Siguiente' : savingCustom ? 'Guardando...' : 'Crear y añadir'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {answerFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4" style={{ background: 'var(--surface)' }}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className="font-bold text-base">{answerFor.text}</h2>
              <button type="button" onClick={() => setAnswerFor(null)} aria-label="Cerrar" className="shrink-0 text-lg font-bold px-1" style={{ color: 'var(--text-muted2)' }}>✕</button>
            </div>
            {(jackpotByTemplate[answerFor.id] ?? 0) > 0 && (
              <p className="text-xs font-bold mb-2" style={{ color: 'var(--orange)' }}>
                🎰 Jackpot acumulado: {jackpotByTemplate[answerFor.id]} fichas (nadie acertó la última vez)
              </p>
            )}
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Elige las respuestas entre las que se podrá apostar en esta jornada.
            </p>

            {answerFor.answer_type === 'player' && (
              <div className="flex flex-col gap-2 mb-3">
                {loadingPlayers && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cargando jugadores...</p>}
                {playerChoices.map((p, i) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm rounded-xl px-3 py-2.5" style={{ background: 'var(--surface2)' }}>
                    <input type="checkbox" checked={p.checked} onChange={e => setPlayerChoices(list => list.map((x, j) => j === i ? { ...x, checked: e.target.checked } : x))} />
                    {p.name}
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm rounded-xl px-3 py-2.5" style={{ background: 'var(--surface2)' }}>
                  <input type="checkbox" checked={includeNone} onChange={e => setIncludeNone(e.target.checked)} />
                  Ninguno / no ocurrió
                </label>
              </div>
            )}

            {answerFor.answer_type === 'yes_no' && (
              <div className="flex flex-col gap-2 mb-3">
                {answerTexts.map((a, i) => (
                  <input key={i} value={a} onChange={e => setAnswerTexts(list => list.map((x, j) => j === i ? e.target.value : x))} style={inputStyle} />
                ))}
              </div>
            )}

            {answerFor.answer_type === 'custom_options' && (
              <div className="flex flex-col gap-2 mb-3">
                {answerTexts.map((a, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input value={a} onChange={e => setAnswerTexts(list => list.map((x, j) => j === i ? e.target.value : x))} placeholder={`Respuesta ${i + 1}`} style={inputStyle} />
                    {answerTexts.length > 2 && (
                      <button type="button" onClick={() => setAnswerTexts(list => list.filter((_, j) => j !== i))} className="px-3 text-xs font-bold rounded-lg" style={{ background: 'var(--tint)', color: 'var(--red)' }}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setAnswerTexts(list => [...list, ''])} className="text-xs font-bold text-left" style={{ color: 'var(--accent)' }}>
                  + Añadir respuesta
                </button>
              </div>
            )}

            {error && <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={() => setAnswerFor(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'var(--tint)', color: '#555' }}>
                Cancelar
              </button>
              <button type="button" onClick={confirmAnswers} disabled={adding === answerFor.id} className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#fff' }}>
                {adding === answerFor.id ? 'Añadiendo...' : 'Añadir a las apuestas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
