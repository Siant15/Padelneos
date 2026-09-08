'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingQuestionTemplate } from '@/lib/types'
import { revalidateLigaData } from '@/lib/actions'
import { friendlyError } from '@/lib/errors'

type CustomAnswerType = 'yes_no' | 'player' | 'custom_options'

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

const MAX_PAID_QUESTIONS = 6

// Catálogo de preguntas que no se aplican solas a cada jornada
// (auto_apply = false): cualquier jugador puede añadirlas aquí para
// no saturar la interfaz por defecto. También se puede crear una
// pregunta totalmente nueva: se guarda en el catálogo (para poder
// reutilizarla en futuras jornadas) y se aplica a esta a la vez.
// Máximo 6 preguntas de pago por jornada (el marcador exacto no cuenta).
export default function AddQuestionPicker({ roundId, templates, paidCount }: { roundId: string; templates: BettingQuestionTemplate[]; paidCount: number }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [creating, setCreating] = useState(false)
  const [text, setText] = useState('')
  const [answerType, setAnswerType] = useState<CustomAnswerType>('yes_no')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [allowNone, setAllowNone] = useState(false)
  const [savingCustom, setSavingCustom] = useState(false)

  const atLimit = paidCount >= MAX_PAID_QUESTIONS

  function startEdit(t: BettingQuestionTemplate) {
    setEditingId(t.id)
    setEditText(t.text)
  }

  async function saveEdit(templateId: string) {
    if (!editText.trim()) return
    if (!window.confirm('Este texto es del catálogo compartido: el cambio se aplicará también a cualquier otra jornada (pasada o futura) que use esta misma pregunta, no solo a esta. ¿Continuar?')) return
    setSavingEdit(true)
    setError('')
    const { error: updateError } = await supabase.from('betting_question_templates').update({ text: editText.trim() }).eq('id', templateId)
    setSavingEdit(false)
    if (updateError) {
      setError(friendlyError(updateError.message, 'No se pudo guardar el cambio. Inténtalo de nuevo.'))
      return
    }
    setEditingId(null)
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

  async function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || atLimit) return
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
        allow_none: allowNone,
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

    setText(''); setOptions(['', '']); setAllowNone(false); setAnswerType('yes_no'); setCreating(false)
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
          {templates.map(t => (
            editingId === t.id ? (
              <div key={t.id} className="flex gap-1.5">
                <input value={editText} onChange={e => setEditText(e.target.value)} style={inputStyle} />
                <button onClick={() => saveEdit(t.id)} disabled={savingEdit} className="px-3 text-xs font-bold rounded-lg disabled:opacity-40" style={{ background: 'var(--accent)', color: '#fff' }}>
                  {savingEdit ? '...' : '✓'}
                </button>
                <button onClick={() => setEditingId(null)} className="px-2 text-xs font-bold rounded-lg" style={{ background: 'var(--tint)', color: '#555' }}>✕</button>
              </div>
            ) : (
              <div key={t.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => addTemplate(t.id)}
                  disabled={adding === t.id || atLimit}
                  className="flex-1 text-left text-xs font-semibold px-3 py-2 rounded-xl transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'var(--surface2)', color: 'var(--text)' }}
                >
                  {adding === t.id ? 'Añadiendo...' : t.text}
                </button>
                <button onClick={() => startEdit(t)} aria-label="Editar pregunta" title="Editar el texto de esta pregunta (afecta a todas las jornadas que la usen)" className="text-xs px-1.5 shrink-0" style={{ color: 'var(--text-muted2)' }}>
                  ✏️
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
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Ej: ¿Se caerá alguien en pista?"
                required
                style={inputStyle}
              />
              <select value={answerType} onChange={e => setAnswerType(e.target.value as CustomAnswerType)} style={inputStyle}>
                <option value="yes_no">Sí / No</option>
                <option value="player">Elegir un jugador del partido</option>
                <option value="custom_options">Opciones personalizadas</option>
              </select>

              {answerType === 'custom_options' && (
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

              {(answerType === 'player' || answerType === 'custom_options') && (
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={allowNone} onChange={e => setAllowNone(e.target.checked)} />
                  Permitir la opción &quot;Ninguno&quot;
                </label>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => setCreating(false)} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: 'var(--tint)', color: '#555' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={savingCustom} className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#fff' }}>
                  {savingCustom ? 'Guardando...' : 'Crear y añadir'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
