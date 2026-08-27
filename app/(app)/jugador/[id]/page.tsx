import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSeasonCompetitiveDna } from '@/lib/dna-data'
import CompetitiveDnaRadar from '@/components/CompetitiveDnaRadar'

const HAND_LABEL: Record<string, string> = { diestra: 'Diestra', zurda: 'Zurda' }
const SIDE_LABEL: Record<string, string> = { drive: 'Drive (derecha)', reves: 'Revés (izquierda)' }

export default async function JugadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params
  const supabase = await createClient()

  const [{ data: profile }, { data: activeSeason }, { data: mostRecentSeason }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', playerId).maybeSingle(),
    supabase.from('seasons').select('id, name').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('seasons').select('id, name').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!profile) {
    return (
      <div className="px-5 pt-5 pb-6">
        <Link href="/liga" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</Link>
        <p className="mt-4 text-sm text-center" style={{ color: 'var(--text-muted)' }}>No se encontró este jugador.</p>
      </div>
    )
  }

  const season = activeSeason ?? mostRecentSeason

  const [{ data: standing }, dnaPlayers] = await Promise.all([
    season
      ? supabase.from('individual_standings').select('matches_played, wins, total_points').eq('season_id', season.id).eq('player_id', playerId).maybeSingle()
      : Promise.resolve({ data: null }),
    season ? getSeasonCompetitiveDna(supabase, season.id) : Promise.resolve([]),
  ])

  const stats = standing ?? { matches_played: 0, wins: 0, total_points: 0 }

  return (
    <div className="px-5 pt-5 pb-6">
      <Link href="/liga" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Volver</Link>

      <div className="flex flex-col items-center mt-4 mb-5">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="rounded-full object-cover" style={{ width: 84, height: 84, border: '2px solid var(--border)' }} />
        ) : (
          <div
            className="flex items-center justify-center rounded-full font-heading font-extrabold text-2xl"
            style={{ width: 84, height: 84, background: 'var(--surface2)', color: 'var(--accent)', border: '2px solid var(--border)' }}
          >
            {profile.name.slice(0, 2).toUpperCase() || '🎾'}
          </div>
        )}
        <h1 className="font-heading text-[20px] font-extrabold mt-3">{profile.name}</h1>
        {(profile.racket_brand || profile.dominant_hand || profile.preferred_side) && (
          <p className="text-xs mt-1 text-center" style={{ color: 'var(--text-muted)' }}>
            {[
              profile.racket_brand && `🎾 ${profile.racket_brand}`,
              profile.dominant_hand && HAND_LABEL[profile.dominant_hand],
              profile.preferred_side && SIDE_LABEL[profile.preferred_side],
            ].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <StatCard value={stats.matches_played} label="Partidos" />
        <StatCard value={stats.wins} label="Victorias" />
        <StatCard value={stats.total_points} label="Puntos" accent />
      </div>

      {dnaPlayers.length > 0 && (
        <CompetitiveDnaRadar players={dnaPlayers} viewerId={playerId} seasonLabel={season?.name ?? ''} />
      )}
    </div>
  )
}

function StatCard({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-3.5 text-center"
      style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
    >
      <div className="font-heading font-extrabold text-lg" style={{ color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}
