import { createClient as createRawClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { getRoundActa, getRoundBettingContext, getSeasonBettingRanking } from '@/lib/betting-queries'
import { getSeasonCompetitiveDna } from '@/lib/dna-data'

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
      roundIds.length
        ? client.from('betting_round_results').select('round_id, player_id, rank, chips_net, point_bonus, player:profiles(id, name)').in('round_id', roundIds)
        : Promise.resolve({ data: [] as { round_id: string; player_id: string; rank: number; chips_net: number; point_bonus: number }[] }),
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

// El ADN competitivo de la temporada es igual para los 4 jugadores
// (Perfil y el perfil público de cualquier jugador piden el mismo
// cálculo), así que se cachea igual que el resto — evita recalcularlo
// desde cero en cada visita a un perfil.
export const getCachedSeasonCompetitiveDna = unstable_cache(
  async (seasonId: string) => getSeasonCompetitiveDna(serviceClient(), seasonId),
  ['season-dna'],
  { revalidate: REVALIDATE_SECONDS, tags: ['liga-data'] }
)

// El acta de una jornada liquidada es igual para los 4 jugadores y ya
// no cambia (salvo que se deshaga la liquidación), así que se cachea
// igual que el resto de datos de liga — evita repetir ~6 consultas por
// jornada liquidada en cada visita a Liga → Apuestas.
export const getCachedSettledActas = unstable_cache(
  async (roundIds: string[], players: { id: string; name: string }[]) => {
    const client = serviceClient()
    return Promise.all(roundIds.map(id => getRoundActa(client, id, players)))
  },
  ['settled-actas'],
  { revalidate: REVALIDATE_SECONDS, tags: ['liga-data'] }
)

// El contexto de apuestas de las jornadas abiertas sí depende del
// jugador (fichas restantes, apuestas propias), así que el userId es
// parte de la clave de caché — cada jugador cachea su propia vista.
export const getCachedOpenRoundsBetting = unstable_cache(
  async (seasonId: string, roundIds: string[], userId: string) => {
    const client = serviceClient()
    const [contexts, { data: catalogTemplates }, { data: usageRows }] = await Promise.all([
      Promise.all(roundIds.map(id => getRoundBettingContext(client, id, userId))),
      client.from('betting_question_templates').select('*').eq('active', true).order('text'),
      client.from('betting_markets').select('template_id').not('template_id', 'is', null),
    ])

    // "+ Añadir más preguntas" ordenada de más a menos usada, en vez de
    // alfabética — así las preguntas que de verdad se juegan quedan
    // arriba y no hay que buscar entre las que nadie elige.
    const usageCount: Record<string, number> = {}
    for (const row of usageRows ?? []) {
      if (row.template_id) usageCount[row.template_id] = (usageCount[row.template_id] ?? 0) + 1
    }
    const sortedCatalog = [...(catalogTemplates ?? [])].sort((a, b) => (usageCount[b.id] ?? 0) - (usageCount[a.id] ?? 0))

    const allTemplateIds = [...new Set(contexts.flatMap(ctx => ctx.markets.map(m => m.template_id).filter((id): id is string => !!id)))]
    const { data: jackpots } = allTemplateIds.length
      ? await client.from('jackpots').select('template_id, chips').eq('season_id', seasonId).in('template_id', allTemplateIds)
      : { data: [] as { template_id: string; chips: number }[] }
    const jackpotByTemplate: Record<string, number> = {}
    for (const j of jackpots ?? []) jackpotByTemplate[j.template_id] = j.chips

    return { contexts, catalogTemplates: sortedCatalog, jackpotByTemplate }
  },
  ['open-rounds-betting'],
  { revalidate: REVALIDATE_SECONDS, tags: ['liga-data'] }
)

// El ranking de apuestas de la temporada (vista betting_leaderboard)
// es igual para los 4 jugadores, pero se quedó fuera de la caché — se
// pedía sin pasar por unstable_cache en cada visita a Inicio/Piques,
// a diferencia del resto de datos que usa getInicioData.
export const getCachedSeasonBettingRanking = unstable_cache(
  async (seasonId: string) => getSeasonBettingRanking(serviceClient(), seasonId),
  ['season-betting-ranking'],
  { revalidate: REVALIDATE_SECONDS, tags: ['liga-data'] }
)
