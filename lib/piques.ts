// "El pique de la jornada": narrativas calculadas a partir de los
// resultados reales de la temporada (nunca datos inventados). Se
// recalculan cada vez que se pide la página (que a su vez está detrás
// de la caché de 15s de lib/supabase/cached.ts + updateTag en
// lib/actions.ts), así que se quedan fijas hasta que se registre un
// nuevo resultado o se liquide una jornada.

export type RoundWithMatch = {
  id: string
  round_number: number
  status: string
  match: {
    winner: 'team1' | 'team2' | 'draw' | null
    team1_p1?: { id: string; name: string } | null
    team1_p2?: { id: string; name: string } | null
    team2_p1?: { id: string; name: string } | null
    team2_p2?: { id: string; name: string } | null
  } | null
}

export type BetResultRow = { round_id: string; player_id: string; point_bonus: number }

export type PlayerLite = { id: string; name: string }

type Totals = Record<string, { sport: number; bet: number }>

function rankOrder(players: PlayerLite[], totals: Totals): string[] {
  return [...players]
    .sort((a, b) => {
      const ta = totals[a.id] ?? { sport: 0, bet: 0 }
      const tb = totals[b.id] ?? { sport: 0, bet: 0 }
      return (tb.sport + tb.bet) - (ta.sport + ta.bet) || tb.sport - ta.sport || a.id.localeCompare(b.id)
    })
    .map(p => p.id)
}

function totalsUpTo(players: PlayerLite[], playedRounds: RoundWithMatch[], betResults: BetResultRow[], uptoIndex: number): Totals {
  const totals: Totals = {}
  for (const p of players) totals[p.id] = { sport: 0, bet: 0 }
  for (let i = 0; i <= uptoIndex; i++) {
    const m = playedRounds[i].match
    if (!m?.winner) continue
    const team1 = [m.team1_p1?.id, m.team1_p2?.id].filter((x): x is string => !!x)
    const team2 = [m.team2_p1?.id, m.team2_p2?.id].filter((x): x is string => !!x)
    if (m.winner === 'draw') {
      for (const id of [...team1, ...team2]) if (totals[id]) totals[id].sport += 1
    } else {
      const winners = m.winner === 'team1' ? team1 : team2
      for (const id of winners) if (totals[id]) totals[id].sport += 2
    }
    const roundId = playedRounds[i].id
    for (const b of betResults) if (b.round_id === roundId && totals[b.player_id]) totals[b.player_id].bet += b.point_bonus
  }
  return totals
}

export type PlayerRow = {
  id: string
  name: string
  rank: number
  points: number
  rankDelta: number // positivo = ha subido puestos
  results: ('V' | 'D')[] // últimos partidos, más reciente al final
  activeStreak: { type: 'V' | 'D'; length: number } | null
}

export function computeStandingsRows(
  players: PlayerLite[],
  rounds: RoundWithMatch[],
  betResults: BetResultRow[]
): PlayerRow[] {
  const playedRounds = rounds.filter(r => r.status === 'played' && r.match?.winner)
  const lastIndex = playedRounds.length - 1

  const currentTotals = totalsUpTo(players, playedRounds, betResults, lastIndex)
  const previousTotals = lastIndex >= 0 ? totalsUpTo(players, playedRounds, betResults, lastIndex - 1) : currentTotals
  const currentOrder = rankOrder(players, currentTotals)
  const previousOrder = rankOrder(players, previousTotals)

  // Resultados de cada jugador en orden cronológico (para la racha).
  const resultsByPlayer: Record<string, ('V' | 'D')[]> = {}
  for (const p of players) resultsByPlayer[p.id] = []
  for (const r of playedRounds) {
    const m = r.match
    if (!m?.winner || m.winner === 'draw') continue
    const team1 = [m.team1_p1?.id, m.team1_p2?.id].filter((x): x is string => !!x)
    const team2 = [m.team2_p1?.id, m.team2_p2?.id].filter((x): x is string => !!x)
    for (const id of team1) resultsByPlayer[id]?.push(m.winner === 'team1' ? 'V' : 'D')
    for (const id of team2) resultsByPlayer[id]?.push(m.winner === 'team2' ? 'V' : 'D')
  }

  return players.map(p => {
    const totals = currentTotals[p.id] ?? { sport: 0, bet: 0 }
    const results = resultsByPlayer[p.id] ?? []
    const last3 = results.slice(-3)
    let activeStreak: PlayerRow['activeStreak'] = null
    if (results.length > 0) {
      const type = results[results.length - 1]
      let length = 0
      for (let i = results.length - 1; i >= 0 && results[i] === type; i--) length++
      activeStreak = { type, length }
    }
    return {
      id: p.id,
      name: p.name,
      rank: currentOrder.indexOf(p.id) + 1,
      points: totals.sport + totals.bet,
      rankDelta: previousOrder.indexOf(p.id) - currentOrder.indexOf(p.id),
      results: last3,
      activeStreak,
    }
  }).sort((a, b) => a.rank - b.rank)
}

// Historial de enfrentamientos DIRECTOS (como rivales, no como pareja):
// head2head[a][b] = veces que a le ha ganado a b jugando en su contra.
export function computeHeadToHead(rounds: RoundWithMatch[]): Record<string, Record<string, number>> {
  const h2h: Record<string, Record<string, number>> = {}
  const bump = (winner: string, loser: string) => {
    h2h[winner] ??= {}
    h2h[winner][loser] = (h2h[winner][loser] ?? 0) + 1
  }
  for (const r of rounds) {
    const m = r.match
    if (r.status !== 'played' || !m?.winner || m.winner === 'draw') continue
    const team1 = [m.team1_p1?.id, m.team1_p2?.id].filter((x): x is string => !!x)
    const team2 = [m.team2_p1?.id, m.team2_p2?.id].filter((x): x is string => !!x)
    const winners = m.winner === 'team1' ? team1 : team2
    const losers = m.winner === 'team1' ? team2 : team1
    for (const w of winners) for (const l of losers) bump(w, l)
  }
  return h2h
}

export type Pique = {
  type: 'en_llamas' | 'remontada' | 'cuentas_pendientes' | 'tapado' | 'rey_pronosticos' | 'bajo_presion'
  category: string
  title: string
  text: string
  score: number // 0-1, para elegir las 2 más relevantes de las 6
}

export function computePiques(
  rows: PlayerRow[],
  headToHead: Record<string, Record<string, number>>,
  bettingTop: { name: string; correctPicks: number } | null
): Pique[] {
  const candidates: Pique[] = []
  const byRank = [...rows].sort((a, b) => a.rank - b.rank)

  // En llamas: jugador con mejor racha (de victorias) activa.
  const onFire = byRank
    .filter(r => r.activeStreak?.type === 'V')
    .sort((a, b) => (b.activeStreak?.length ?? 0) - (a.activeStreak?.length ?? 0))[0]
  if (onFire) {
    const length = onFire.activeStreak!.length
    candidates.push({
      type: 'en_llamas', category: 'En llamas',
      title: `${onFire.name} está en racha`,
      text: `${length} victoria${length === 1 ? '' : 's'} seguida${length === 1 ? '' : 's'}`,
      score: Math.min(1, length / 4),
    })
  }

  // La remontada: quien más puestos ha subido respecto a la jornada anterior.
  const climber = [...byRank].sort((a, b) => b.rankDelta - a.rankDelta)[0]
  if (climber && climber.rankDelta > 0) {
    candidates.push({
      type: 'remontada', category: 'La remontada',
      title: `La remontada de ${climber.name}`,
      text: `Sube ${climber.rankDelta} puesto${climber.rankDelta === 1 ? '' : 's'} esta jornada`,
      score: Math.min(1, climber.rankDelta / 3),
    })
  }

  // Partido con cuentas pendientes: la pareja de rivales con el
  // enfrentamiento directo más igualado (más partidos jugados entre
  // ellos y la diferencia de victorias más pequeña posible).
  let bestPair: { a: PlayerRow; b: PlayerRow; aWins: number; bWins: number } | null = null
  for (let i = 0; i < byRank.length; i++) {
    for (let j = i + 1; j < byRank.length; j++) {
      const a = byRank[i], b = byRank[j]
      const aWins = headToHead[a.id]?.[b.id] ?? 0
      const bWins = headToHead[b.id]?.[a.id] ?? 0
      const total = aWins + bWins
      if (total === 0) continue
      const diff = Math.abs(aWins - bWins)
      if (!bestPair || total - diff > (bestPair.aWins + bestPair.bWins) - Math.abs(bestPair.aWins - bestPair.bWins)) {
        bestPair = { a, b, aWins, bWins }
      }
    }
  }
  if (bestPair) {
    const total = bestPair.aWins + bestPair.bWins
    const diff = Math.abs(bestPair.aWins - bestPair.bWins)
    candidates.push({
      type: 'cuentas_pendientes', category: 'Cuentas pendientes',
      title: `${bestPair.a.name} vs ${bestPair.b.name}`,
      text: `${bestPair.aWins}-${bestPair.bWins} en sus enfrentamientos directos`,
      score: Math.min(1, (total - diff) / 4),
    })
  }

  // El tapado: el peor clasificado con más probabilidad de sorprender
  // (mejor racha reciente entre los que están más abajo en la tabla).
  const lastTwo = byRank.slice(-2)
  const tapado = [...lastTwo].sort((a, b) => {
    const scoreOf = (r: PlayerRow) => r.results.filter(x => x === 'V').length - r.results.filter(x => x === 'D').length
    return scoreOf(b) - scoreOf(a)
  })[0]
  if (tapado) {
    const wins = tapado.results.filter(x => x === 'V').length
    const hasMomentum = wins > 0
    candidates.push({
      type: 'tapado', category: 'El tapado',
      title: `${tapado.name}, el tapado`,
      text: hasMomentum ? 'Va de menos a más y puede dar la sorpresa' : 'El que nadie quiere encontrarse en el cuadro',
      score: hasMomentum ? Math.min(1, 0.4 + wins * 0.2) : 0.2,
    })
  }

  // Rey de los pronósticos: quien más apuestas ha acertado.
  if (bettingTop && bettingTop.correctPicks > 0) {
    candidates.push({
      type: 'rey_pronosticos', category: 'Rey de los pronósticos',
      title: `${bettingTop.name}, rey de los pronósticos`,
      text: `${bettingTop.correctPicks} apuesta${bettingTop.correctPicks === 1 ? '' : 's'} acertada${bettingTop.correctPicks === 1 ? '' : 's'} esta temporada`,
      score: Math.min(1, bettingTop.correctPicks / 6),
    })
  }

  // Bajo presión: quien necesita ganar para no perder posición (menor
  // diferencia de puntos con quien tiene justo debajo en la tabla).
  let underPressure: { row: PlayerRow; gap: number } | null = null
  for (let i = 0; i < byRank.length - 1; i++) {
    const gap = byRank[i].points - byRank[i + 1].points
    if (!underPressure || gap < underPressure.gap) underPressure = { row: byRank[i], gap }
  }
  if (underPressure) {
    candidates.push({
      type: 'bajo_presion', category: 'Bajo presión',
      title: `${underPressure.row.name} bajo presión`,
      text: underPressure.gap === 0 ? 'Empatado con quien le pisa los talones' : `Solo ${underPressure.gap} punto${underPressure.gap === 1 ? '' : 's'} de ventaja sobre el siguiente`,
      score: Math.min(1, 1 - underPressure.gap / 4),
    })
  }

  return candidates.sort((a, b) => b.score - a.score)
}
