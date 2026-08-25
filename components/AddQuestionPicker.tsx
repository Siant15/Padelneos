'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingQuestionTemplate } from '@/lib/types'

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

// Catálogo de preguntas que no se aplican solas a cada jornada
// (auto_apply = false): cualquier jugador puede añadirlas aquí para
// no saturar la interfaz por defecto. También se puede crear una
// pregunta totalmente nueva: se guarda en el catálogo (para poder
// reutilizarla en futuras jornadas) y se aplica a esta a la vez.
export default function AddQuestionPicker({ roundId, templates }: { roundId: string; templates: BettingQuestionTemplate[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [creating, setCreating] = useState(false)
  const [text, setText] = useState('')
  const [answerType, setAnswerType] = useState<CustomAnswerType>('yes_no')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [allowNone, setAllowNone] = useState(false)
  const [savingCustom, setSavingCustom] = useState(false)

  async function addTemplate(templateId: string) {
    setAdding(templateId)
    setError('')
    const { error: rpcError } = await supabase.rpc('instantiate_round_questions', {
      p_round_id: roundId,
      p_template_ids: [templateId],
    })
    setAdding(null)
    if (rpcError) {
      setError('No se pudo añadir la pregunta: ' + rpcError.message)
      return
    }
    router.refresh()
  }

  async function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
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
      setError('No se pudo guardar la pregunta: ' + (insertError?.message ?? ''))
      return
    }

    const { error: rpcError } = await supabase.rpc('instantiate_round_questions', {
      p_round_id: roundId,
      p_template_ids: [newTemplate.id],
    })
    setSavingCustom(false)
    if (rpcError) {
      setError('La pregunta se guardó en el catálogo, pero no se pudo añadir a esta jornada: ' + rpcError.message)
      return
    }

    setText(''); setOptions(['', '']); setAllowNone(false); setAnswerType('yes_no'); setCreating(false)
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
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => addTemplate(t.id)}
              disabled={adding === t.id}
              className="text-left text-xs font-semibold px-3 py-2 rounded-xl transition hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--surface2)', color: 'var(--text)' }}
            >
              {adding === t.id ? 'Añadiendo...' : t.text}
            </button>
          ))}

          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="text-left text-xs font-bold px-3 py-2 rounded-xl transition hover:opacity-90"
              style={{ background: 'var(--tint)', color: 'var(--accent)' }}
            >
              + Crear pregunta personalizada
            </button>
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
