'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatTime } from '@/lib/types'
import { listRounds, deleteRound, deleteSeason, type SeasonRow, type RoundRow } from '@/lib/admin-actions'

const STATUS_LABEL: Record<string, string> = { scheduled: 'Programada', played: 'Jugada', cancelled: 'Cancelada' }

export default function AdminSeasons({ seasons }: { seasons: SeasonRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {seasons.map(s => <SeasonCard key={s.id} season={s} />)}
      {!seasons.length && (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Todavía no hay temporadas.</p>
      )}
    </div>
  )
}

function SeasonCard({ season }: { season: SeasonRow }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rounds, setRounds] = useState<RoundRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (!rounds) {
      setLoading(true)
      setRounds(await listRounds(season.id))
      setLoading(false)
    }
  }

  async function handleDeleteSeason() {
    setDeleting(true)
    setError('')
    const { error } = await deleteSeason(season.id)
    setDeleting(false)
    if (error) { setError(error); return }
    router.refresh()
  }

  async function handleRoundDeleted(roundId: string) {
    setRounds(r => r?.filter(x => x.id !== roundId) ?? null)
    router.refresh()
  }

  return (
    <div className="rounded-2xl p-4 min-w-0" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
      <button onClick={toggle} className="text-left block w-full min-w-0">
        <p className="font-bold text-sm truncate">{season.name}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
          {season.status === 'active' ? 'Activa' : 'Finalizada'} · {season.roundCount}/{season.minMatches} jornadas
        </p>
      </button>
      <div className="flex flex-wrap gap-2 mt-2.5">
        <button onClick={() => setConfirming(true)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'oklch(0.95 0.04 30)', color: 'var(--red)' }}>
          Eliminar
        </button>
      </div>

      {confirming && (
        <div className="mt-3 rounded-xl p-3" style={{ background: 'oklch(0.97 0.02 30)' }}>
          <p className="text-xs font-bold mb-2" style={{ color: 'var(--red)' }}>
            Esto borra la temporada &quot;{season.name}&quot; entera: todas sus jornadas, partidos, apuestas y estadísticas. No se puede deshacer.
            Escribe el nombre de la temporada para confirmar.
          </p>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={season.name}
            className="w-full mb-2"
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 16 }}
          />
          <div className="flex gap-2">
            <button onClick={() => { setConfirming(false); setConfirmText('') }} className="flex-1 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'var(--tint)' }}>
              Cancelar
            </button>
            <button
              onClick={handleDeleteSeason}
              disabled={confirmText !== season.name || deleting}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
              style={{ background: 'var(--red)', color: '#fff' }}
            >
              {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

      {open && (
        <div className="mt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
          {loading && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cargando jornadas...</p>}
          {rounds?.map(r => <RoundRowItem key={r.id} round={r} onDeleted={() => handleRoundDeleted(r.id)} />)}
          {rounds && !rounds.length && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin jornadas.</p>}
        </div>
      )}
    </div>
  )
}

function RoundRowItem({ round, onDeleted }: { round: RoundRow; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const { error } = await deleteRound(round.id)
    setDeleting(false)
    if (error) { setError(error); return }
    onDeleted()
  }

  return (
    <div className="rounded-xl px-3 py-2 min-w-0" style={{ background: 'var(--surface2)' }}>
      <div className="text-xs break-words">
        <span className="font-bold">J{round.roundNumber}</span> · {STATUS_LABEL[round.status] ?? round.status}
        {round.scheduledDate && <> · {round.scheduledDate}{round.scheduledTime ? ` ${formatTime(round.scheduledTime)}` : ''}</>}
        {round.club && <> · {round.club}</>}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        <Link href={`/admin/jornadas/${round.id}/editar`} className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: 'var(--tint)', color: 'var(--text-muted2)' }}>
          Editar
        </Link>
        <button onClick={() => setConfirming(true)} className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: 'oklch(0.95 0.04 30)', color: 'var(--red)' }}>
          Eliminar
        </button>
      </div>
      {confirming && (
        <div className="mt-2 flex items-center gap-2">
          <p className="text-[11px] flex-1" style={{ color: 'var(--red)' }}>¿Borrar J{round.roundNumber} y todo lo asociado?</p>
          <button onClick={() => setConfirming(false)} className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: 'var(--tint)' }}>No</button>
          <button onClick={handleDelete} disabled={deleting} className="text-[11px] font-bold px-2 py-1 rounded-lg disabled:opacity-50" style={{ background: 'var(--red)', color: '#fff' }}>
            {deleting ? '...' : 'Sí'}
          </button>
        </div>
      )}
      {error && <p className="text-[11px] mt-1" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
    </div>
  )
}
