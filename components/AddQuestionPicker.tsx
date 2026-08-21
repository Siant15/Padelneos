'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BettingQuestionTemplate } from '@/lib/types'

// Catálogo de preguntas que no se aplican solas a cada jornada
// (auto_apply = false): cualquier jugador puede añadirlas aquí para
// no saturar la interfaz por defecto.
export default function AddQuestionPicker({ roundId, templates }: { roundId: string; templates: BettingQuestionTemplate[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState('')

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
        </div>
      )}
    </div>
  )
}
