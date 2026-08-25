import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/types'

export default async function HistoricoPage() {
  const supabase = await createClient()
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name, start_date, min_matches')
    .eq('status', 'finished')
    .order('start_date', { ascending: false })

  return (
    <div className="px-5 pt-5 pb-6">
      <Link href="/liga" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</Link>
      <h1 className="font-heading text-[22px] font-extrabold mt-2 mb-4">Ligas finalizadas</h1>

      {!seasons?.length && (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          Todavía no hay ninguna liga finalizada.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {(seasons ?? []).map(s => (
          <Link
            key={s.id}
            href={`/liga/historico/${s.id}`}
            className="rounded-2xl p-4 flex items-center justify-between transition hover:opacity-90"
            style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
          >
            <div>
              <p className="font-bold text-sm">{s.name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Empezó el {formatDate(s.start_date)} · {s.min_matches} jornadas
              </p>
            </div>
            <span style={{ color: 'var(--text-muted2)' }}>→</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
