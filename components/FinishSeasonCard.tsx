'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { revalidateLigaData } from '@/lib/actions'
import { friendlyError } from '@/lib/errors'

// La liga no se cierra sola: cuando ya no queda ninguna jornada por jugar,
// aparece este botón para todos y cualquier jugador puede confirmar el
// cierre (RPC finish_season: devuelve los botes pendientes y deja la liga
// en el histórico).
export default function FinishSeasonCard({ seasonId, seasonName }: { seasonId: string; seasonName?: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function finish() {
    setBusy(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('finish_season', { p_season_id: seasonId })
      if (rpcError) {
        setError(friendlyError(rpcError.message, 'No se pudo cerrar la liga. Inténtalo de nuevo.'))
        return
      }
      await revalidateLigaData()
      router.push(`/liga/historico/${seasonId}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2.5" style={{ background: 'var(--surface2)' }}>
      <p className="font-heading font-bold text-sm">🏁 {seasonName ? `${seasonName}: ` : ''}la liga ha terminado</p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Ya no queda ninguna jornada por jugar. Cualquiera puede cerrarla: queda el resumen final en el histórico y se devuelven los botes pendientes.
      </p>
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)}
          className="w-full py-3 rounded-xl font-semibold text-sm transition hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          Cerrar la liga
        </button>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={finish} disabled={busy}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {busy ? 'Cerrando...' : 'Sí, cerrar la liga'}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy}
            className="flex-1 py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
            style={{ background: 'var(--tint)', color: 'var(--text-muted)' }}>
            Todavía no
          </button>
        </div>
      )}
    </div>
  )
}
