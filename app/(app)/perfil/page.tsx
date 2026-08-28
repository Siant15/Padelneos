import { createClient, getCachedUser } from '@/lib/supabase/server'
import PerfilForm from '@/components/PerfilForm'
import { getCachedSeasonCompetitiveDna } from '@/lib/supabase/cached'

export default async function PerfilPage() {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user) return null

  // La consulta de "temporada más reciente de cualquier estado" se
  // lanza siempre en paralelo con las otras dos (aunque se descarte si
  // hay temporada activa) en vez de esperar a saberlo primero — cuesta
  // una consulta de más en el caso común, pero evita un round-trip
  // extra en serie cuando no hay temporada activa.
  const [{ data: profile }, { data: activeSeason }, { data: mostRecentSeason }] = await Promise.all([
    supabase.from('profiles').select('name, racket_brand, dominant_hand, preferred_side, avatar_url').eq('id', user.id).maybeSingle(),
    supabase.from('seasons').select('id, name').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('seasons').select('id, name').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // Si no hay temporada activa, se usa la más reciente de cualquier
  // estado (determinista: siempre la misma hasta que se cree otra).
  const season = activeSeason ?? mostRecentSeason

  const [{ data: standing }, dnaPlayers] = await Promise.all([
    season
      ? supabase.from('individual_standings').select('matches_played, wins, total_points').eq('season_id', season.id).eq('player_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    season ? getCachedSeasonCompetitiveDna(season.id) : Promise.resolve([]),
  ])

  return (
    <PerfilForm
      userId={user.id}
      initialName={profile?.name ?? user.email?.split('@')[0] ?? ''}
      initialRacketBrand={profile?.racket_brand ?? ''}
      initialDominantHand={profile?.dominant_hand ?? ''}
      initialPreferredSide={profile?.preferred_side ?? ''}
      initialAvatarUrl={profile?.avatar_url ?? null}
      initialStats={standing ?? { matches_played: 0, wins: 0, total_points: 0 }}
      dnaPlayers={dnaPlayers}
      seasonLabel={season?.name ?? ''}
    />
  )
}
