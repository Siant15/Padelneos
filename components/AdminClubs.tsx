'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addManualClub, deleteClub, type ClubRow } from '@/lib/admin-actions'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 16,
  outline: 'none',
}

export default function AdminClubs({ clubs }: { clubs: ClubRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await addManualClub(name, address, mapsUrl)
    setSaving(false)
    if (error) { setError(error); return }
    setName(''); setAddress(''); setMapsUrl(''); setOpen(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    await deleteClub(id)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Los clubs que no aparecen al buscarlos por internet (en Editar jornada) se pueden añadir aquí a mano.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="font-heading w-full py-2.5 rounded-[14px] font-bold text-sm transition hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + Añadir club manualmente
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
          <input aria-label="Nombre del club" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del club" required style={inputStyle} />
          <input aria-label="Dirección" value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección (opcional)" style={inputStyle} />
          <input aria-label="Enlace de Google Maps" value={mapsUrl} onChange={e => setMapsUrl(e.target.value)} placeholder="Enlace de Google Maps (opcional, se genera solo si lo dejas vacío)" style={inputStyle} />
          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>⚠ {error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2 rounded-xl text-sm font-bold" style={{ background: 'var(--tint)', color: '#555' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#fff' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {clubs.map(c => (
          <div key={c.id} className="rounded-xl px-3 py-2 min-w-0" style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{c.name}</p>
              {c.address && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.address}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {c.mapsUrl && (
                <a href={c.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'var(--tint)', color: 'var(--text-muted2)' }}>
                  Maps
                </a>
              )}
              <button onClick={() => handleDelete(c.id)} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'oklch(0.95 0.04 30)', color: 'var(--red)' }}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {!clubs.length && <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>Todavía no hay clubs registrados.</p>}
      </div>
    </div>
  )
}
