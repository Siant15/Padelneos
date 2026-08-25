'use client'

import { useEffect, useState } from 'react'
import { searchClubsOnline, saveClub, listSavedClubs, type ClubSearchResult, type SavedClub } from '@/lib/club-actions'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 16,
  outline: 'none',
}

// Campo "Club" con búsqueda real por internet (OpenStreetMap/Nominatim,
// sin clave de API): escribe un nombre, busca, y al elegir un
// resultado se guarda su dirección y enlace de Google Maps para
// reutilizarlo sin volver a buscar la próxima vez.
export default function ClubPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<ClubSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<SavedClub[]>([])

  useEffect(() => {
    listSavedClubs().then(setSaved)
  }, [])

  async function handleSearch() {
    setSearching(true)
    setError('')
    setResults(null)
    const { results, error } = await searchClubsOnline(query)
    setSearching(false)
    if (error) { setError(error); return }
    if (!results.length) { setError('No se encontró ningún club con ese nombre.'); return }
    setResults(results)
  }

  async function handlePick(r: ClubSearchResult) {
    onChange(r.name)
    setQuery(r.name)
    setResults(null)
    await saveClub(r)
    setSaved(s => [...s.filter(x => x.name !== r.name), { id: r.name, name: r.name, address: r.address, mapsUrl: r.mapsUrl }].sort((a, b) => a.name.localeCompare(b.name)))
  }

  function pickSaved(c: SavedClub) {
    onChange(c.name)
    setQuery(c.name)
    setResults(null)
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value) }}
          placeholder="Ej: Vall Parc"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || query.trim().length < 3}
          className="px-3 rounded-xl text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {searching ? '...' : '🔍'}
        </button>
      </div>

      {saved.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-2">
          {saved.map(c => (
            <button
              key={c.name}
              type="button"
              onClick={() => pickSaved(c)}
              className="text-xs font-bold px-2.5 py-1 rounded-lg"
              style={{ background: c.name === value ? 'var(--accent)' : 'var(--tint)', color: c.name === value ? '#fff' : 'var(--text-muted2)' }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs mt-1.5" style={{ color: 'var(--red)' }}>⚠ {error}</p>}

      {results && results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handlePick(r)}
              className="text-left rounded-lg p-2 text-xs transition hover:opacity-80"
              style={{ background: 'var(--surface2)' }}
            >
              <p className="font-bold">{r.name}</p>
              <p style={{ color: 'var(--text-muted)' }}>{r.address}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
