import { createClient } from '@/lib/supabase/server'
import type { IndividualStanding, PairStanding, BettingRoundResult, Profile } from '@/lib/types'
import ClasificacionTabs from '@/components/ClasificacionTabs'
import Link from 'next/link'

const MEDALS = ['🥇', '🥈', '🥉', '4º']

export default async function ClasificacionPage() {
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const seasonId = season?.id

  const { data: rounds } = seasonId
    ? await supabase.from('rounds').select('id').eq('season_id', seasonId)
    : { data: [] as { id: string }[] }
  const roundIds = (rounds ?? []).map(r => r.id)

  const [{ data: individual }, { data: pairs }, { data: betResults }] = await Promise.all([
    seasonId
      ? supabase.from('individual_standings').select('*').eq('season_id', seasonId)
      : Promise.resolve({ data: [] as IndividualStanding[] }),
    seasonId
      ? supabase.from('pair_standings').select('*').eq('season_id', seasonId)
      : Promise.resolve({ data: [] as PairStanding[] }),
    roundIds.length
      ? supabase.from('betting_round_results').select('*, player:profiles(id, name)').in('round_id', roundIds)
      : Promise.resolve({ data: [] as BettingRoundResult[] }),
  ])

  const individualRows = ((individual as IndividualStanding[] | null) ?? []).map((s, i) => ({
    medal: MEDALS[i] ?? `${i + 1}º`,
    name: s.name,
    pj: s.matches_played,
    deportivo: s.sport_points,
    apuestas: s.betting_bonus,
    total: s.total_points,
  }))

  const pairRows = ((pairs as PairStanding[] | null) ?? []).map(p => ({
    name: `${p.p1_name} / ${p.p2_name}`,
    pj: p.matches_played,
    pg: p.wins,
    pts: p.points,
  }))

  const betTotals: Record<string, { name: string; wins: number; pts: number }> = {}
  for (const r of (betResults as BettingRoundResult[] | null) ?? []) {
    const name = (r.player as Profile)?.name ?? '?'
    if (!betTotals[r.player_id]) betTotals[r.player_id] = { name, wins: 0, pts: 0 }
    if (r.rank === 1) betTotals[r.player_id].wins++
    betTotals[r.player_id].pts += r.point_bonus
  }
  const apuestasRows = Object.values(betTotals)
    .sort((a, b) => b.pts - a.pts)
    .map((r, i) => ({ medal: MEDALS[i] ?? `${i + 1}º`, name: r.name, wins: r.wins, pts: r.pts }))

  return (
    <div className="px-5 pt-5 pb-6">
      <h1 className="font-heading text-[22px] font-extrabold mb-4">🏆 Clasificación</h1>
      <ClasificacionTabs individual={individualRows} parejas={pairRows} apuestas={apuestasRows} />

      <Link
        href="/estadisticas"
        className="mt-5 flex items-center justify-between rounded-2xl px-4 py-3.5 transition hover:opacity-90"
        style={{ background: 'var(--surface)', boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}
      >
        <div>
          <p className="font-heading font-bold text-sm">📊 Estadísticas de juego</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Aces, dobles faltas, bolas por 3 y récords</p>
        </div>
        <span style={{ color: 'var(--text-muted2)' }}>→</span>
      </Link>
    </div>
  )
}
