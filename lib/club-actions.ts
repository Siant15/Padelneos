'use server'

import { createClient } from '@/lib/supabase/server'

export type ClubSearchResult = { name: string; address: string; mapsUrl: string; lat: number; lon: number }
export type SavedClub = { id: string; name: string; address: string | null; mapsUrl: string | null }

// Busca lugares reales por internet (OpenStreetMap/Nominatim, gratis y
// sin clave de API). Se hace desde el servidor: Nominatim exige un
// User-Agent identificable y el navegador no deja fijar ese cabecera
// desde JS, además de evitar problemas de CORS.
export async function searchClubsOnline(query: string): Promise<{ results: ClubSearchResult[]; error: string | null }> {
  const q = query.trim()
  if (q.length < 3) return { results: [], error: null }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(`padel ${q}`)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LigaPadelApp/1.0 (app privada de 4 amigos, contacto via Supabase)' },
    })
    if (!res.ok) return { results: [], error: 'No se pudo contactar con el buscador de lugares.' }

    const data = (await res.json()) as { display_name: string; lat: string; lon: string; name?: string }[]
    const results = data.map(d => ({
      name: d.name || d.display_name.split(',')[0],
      address: d.display_name,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lon}`,
      lat: Number(d.lat),
      lon: Number(d.lon),
    }))
    return { results, error: null }
  } catch {
    return { results: [], error: 'No se pudo buscar ahora mismo. Inténtalo de nuevo en un momento.' }
  }
}

export async function saveClub(club: ClubSearchResult): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('clubs')
    .upsert({ name: club.name, address: club.address, maps_url: club.mapsUrl, lat: club.lat, lon: club.lon }, { onConflict: 'name' })
  if (error) return { error: error.message }
  return { error: null }
}

export async function listSavedClubs(): Promise<SavedClub[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('clubs').select('id, name, address, maps_url').order('name')
  return (data ?? []).map(c => ({ id: c.id, name: c.name, address: c.address, mapsUrl: c.maps_url }))
}
