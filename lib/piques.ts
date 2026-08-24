// "El pique de la jornada": narrativas calculadas a partir de los
// resultados reales de la temporada (nunca datos inventados). Se
// recalculan cada vez que se pide la página (que a su vez está detrás
// de la caché de 15s de lib/supabase/cached.ts + updateTag en
// lib/actions.ts), así que se quedan fijas hasta que se registre un
// nuevo resultado o se liquide una jornada — igual que pide el spec
// ("no deben cambiar mientras el usuario está mirando la pantalla").

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
  type: 'liderato' | 'podio' | 'en_llamas' | 'bajo_presion' | 'remontada' | 'cuentas_pendientes' | 'tapado' | 'rey_pronosticos'
  category: string
  title: string
  text: string
  priority: number // 1 = más prioritario
  score: number // desempate dentro de la misma prioridad
}

export function computePiques(
  rows: PlayerRow[],
  headToHead: Record<string, Record<string, number>>,
  nextPairing: { team1: string[]; team2: string[] } | null,
  bettingTop: { name: string; correctPicks: number; points: number } | null
): Pique[] {
  const candidates: Pique[] = []
  const byRank = [...rows].sort((a, b) => a.rank - b.rank)
  const [r1, r2, r3, r4] = byRank

  // 1) Rivalidades con poca diferencia de puntos.
  if (r1 && r2) {
    const gap = r1.points - r2.points
    if (gap <= 2) {
      candidates.push({
        type: 'liderato', category: 'Liderato',
        title: `${r1.name} vs ${r2.name}`,
        text: gap === 0 ? 'Empatados en la cima' : `Solo ${gap} punto${gap === 1 ? '' : 's'} los separa`,
        priority: 1, score: 10 - gap,
      })
    }
  }
  if (r3 && r4) {
    const gap = r3.points - r4.points
    if (gap <= 2) {
      candidates.push({
        type: 'podio', category: 'Podio',
        title: `${r3.name} vs ${r4.name}`,
        text: gap === 0 ? 'Empatados por el último cajón' : 'Una victoria cambia el orden',
        priority: 1, score: 9 - gap,
      })
    }
  }

  // 2) Posibilidad de adelantar en la próxima jornada: si el próximo
  // partido enfrenta directamente a dos rivales ya detectados arriba,
  // sube su prioridad (empatan con el resto pero con más score).
  if (nextPairing) {
    const pairs = [nextPairing.team1, nextPairing.team2]
    for (const c of candidates) {
      const names = c.title.split(' vs ')
      const involved = byRank.filter(r => names.includes(r.name)).map(r => r.id)
      const facingEachOther = involved.length === 2 && pairs.some(team => involved.every(id => !team.includes(id)))
      if (facingEachOther) c.score += 5
    }
  }

  // 3) Rachas.
  const onFire = byRank.filter(r => r.activeStreak?.type === 'V' && r.activeStreak.length >= 3)
    .sort((a, b) => (b.activeStreak?.length ?? 0) - (a.activeStreak?.length ?? 0))[0]
  if (onFire) {
    candidates.push({
      type: 'en_llamas', category: 'En llamas',
      title: `${onFire.name} está en racha`,
      text: `${onFire.activeStreak!.length} victorias seguidas`,
      priority: 3, score: onFire.activeStreak!.length,
    })
  }
  const underFire = byRank.filter(r => r.activeStreak?.type === 'D' && r.activeStreak.length >= 3)
    .sort((a, b) => (b.activeStreak?.length ?? 0) - (a.activeStreak?.length ?? 0))[0]
  if (underFire) {
    candidates.push({
      type: 'bajo_presion', category: 'Bajo presión',
      title: `${underFire.name} bajo presión`,
      text: `${underFire.activeStreak!.length} derrotas seguidas`,
      priority: 3, score: underFire.activeStreak!.length,
    })
  }

  // 4) Cambios importantes de posición.
  const climber = byRank.filter(r => r.rankDelta >= 2).sort((a, b) => b.rankDelta - a.rankDelta)[0]
  if (climber) {
    candidates.push({
      type: 'remontada', category: 'La remontada',
      title: `La remontada de ${climber.name}`,
      text: `Sube ${climber.rankDelta} puesto${climber.rankDelta === 1 ? '' : 's'} esta jornada`,
      priority: 4, score: climber.rankDelta,
    })
  }

  // 5) Historiales de enfrentamientos igualados o pendientes de revancha,
  // solo si además se van a enfrentar en la próxima jornada.
  if (nextPairing) {
    for (const team of [nextPairing.team1, nextPairing.team2]) {
      const rival = team[0] && nextPairing.team1.includes(team[0]) ? nextPairing.team2 : nextPairing.team1
      for (const a of team) {
        for (const b of rival) {
          const aWins = headToHead[a]?.[b] ?? 0
          const bWins = headToHead[b]?.[a] ?? 0
          if (aWins + bWins === 0) continue
          if (bWins > aWins) {
            const nameA = byRank.find(r => r.id === a)?.name
            const nameB = byRank.find(r => r.id === b)?.name
            if (nameA && nameB) {
              candidates.push({
                type: 'cuentas_pendientes', category: 'Cuentas pendientes',
                title: `${nameA} busca revancha`,
                text: `${bWins}-${aWins} en enfrentamientos directos ante ${nameB}`,
                priority: 5, score: bWins - aWins,
              })
            }
          }
        }
      }
    }
  }

  // 6) El tapado: menos puntos de los cuatro, pero con impulso reciente.
  const lowestPoints = [...byRank].sort((a, b) => a.points - b.points)[0]
  if (lowestPoints && lowestPoints.rank === byRank.length && (lowestPoints.rankDelta > 0 || lowestPoints.activeStreak?.type === 'V')) {
    candidates.push({
      type: 'tapado', category: 'El tapado',
      title: `${lowestPoints.name}, el tapado`,
      text: 'El último de la tabla que nadie se quiere encontrar',
      priority: 6, score: 1,
    })
  }

  // 6) Rendimiento en apuestas.
  if (bettingTop && bettingTop.correctPicks > 0) {
    candidates.push({
      type: 'rey_pronosticos', category: 'Rey de los pronósticos',
      title: `${bettingTop.name}, rey de los pronósticos`,
      text: `${bettingTop.correctPicks} apuesta${bettingTop.correctPicks === 1 ? '' : 's'} acertada${bettingTop.correctPicks === 1 ? '' : 's'} esta temporada`,
      priority: 6, score: bettingTop.correctPicks,
    })
  }

  return candidates.sort((a, b) => a.priority - b.priority || b.score - a.score)
}
