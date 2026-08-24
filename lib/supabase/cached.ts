import { createClient as createRawClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

// Consultas de liga que son iguales para los 4 jugadores (temporada
// activa, calendario, clasificaciones, estado de las apuestas por
// jornada) — no dependen de quién las pide, así que se cachean unos
// segundos en vez de repetirse en cada navegación entre pestañas. Usan
// la service_role key porque unstable_cache no puede depender de
// cookies() (rompe el cacheo); es seguro porque estas tablas ya son de
// lectura pública para cualquier jugador autenticado (RLS `using (true)`).
function serviceClient() {
  return createRawClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const REVALIDATE_SECONDS = 15

export const getCachedActiveSeason = unstable_cache(
  async () => {
    const { data } = await serviceClient()
      .from('seasons')
      .select('id, name, min_matches')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data
  },
  ['active-season'],
  { revalidate: REVALIDATE_SECONDS, tags: ['liga-data'] }
)

export const getCachedPlayers = unstable_cache(
  async () => {
    const { data } = await serviceClient().from('profiles').select('id, name')
    return data ?? []
  },
  ['players'],
  { revalidate: 60, tags: ['liga-data'] }
)

export const getCachedSeasonRounds = unstable_cache(
  async (seasonId: string) => {
    const { data } = await serviceClient()
      .from('rounds')
      .select(`
        *,
        court_booker:profiles!court_booker_id(id, name),
        match:matches(
          id, winner, set1_t1, set1_t2, set2_t1, set2_t2, set3_t1, set3_t2,
          team1_p1:profiles!team1_p1_id(id, name),
          team1_p2:profiles!team1_p2_id(id, name),
          team2_p1:profiles!team2_p1_id(id, name),
          team2_p2:profiles!team2_p2_id(id, name)
        )
      `)
      .eq('season_id', seasonId)
      .order('round_number', { ascending: true })
    return data ?? []
  },
  ['season-rounds'],
  { revalidate: REVALIDATE_SECONDS, tags: ['liga-data'] }
)

export const getCachedSeasonAggregates = unstable_cache(
  async (seasonId: string, matchIds: string[], roundIds: string[]) => {
    const client = serviceClient()
    const [{ data: allStats }, { data: individual }, { data: pairs }, { data: marketsByRound }, { data: settlements }, { data: allBetResults }] = await Promise.all([
      matchIds.length
        ? client.from('match_stats').select('*, player:profiles(id, name)').in('match_id', matchIds)
        : Promise.resolve({ data: [] }),
      client.from('individual_standings').select('*').eq('season_id', seasonId).order('total_points', { ascending: false }).order('sport_points', { ascending: false }),
      client.from('pair_standings').select('*').eq('season_id', seasonId).order('points', { ascending: false }).order('wins', { ascending: false }),
      roundIds.length
        ? client.from('betting_markets').select('round_id, resolved').in('round_id', roundIds)
        : Promise.resolve({ data: [] as { round_id: string; resolved: boolean }[] }),
      roundIds.length
        ? client.from('round_settlements').select('round_id').is('voided_at', null).in('round_id', roundIds)
        : Promise.resolve({ data: [] as { round_id: string }[] }),
      client.from('betting_round_results').select('round_id, player_id, rank, chips_net, point_bonus, player:profiles(id, name)'),
    ])
    return {
      allStats: allStats ?? [],
      individual: individual ?? [],
      pairs: pairs ?? [],
      marketsByRound: marketsByRound ?? [],
      settlements: settlements ?? [],
      allBetResults: allBetResults ?? [],
    }
  },
  ['season-aggregates'],
  { revalidate: REVALIDATE_SECONDS, tags: ['liga-data'] }
)
