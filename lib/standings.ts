import type { IndividualStanding, PairStanding } from '@/lib/types'

// Criterio único de clasificación individual, igual en TODAS las pantallas
// (Inicio, Liga, histórico, avisos, riesgo de cena):
//   1) puntos totales (deporte + apuestas)
//   2) puntos deportivos
//   3) partidos ganados
//   4) nombre (alfabético; solo desempata un empate total, y es estable)
export type RankableIndividual = { name: string; total: number; sport: number; wins: number }

export function compareIndividual(a: RankableIndividual, b: RankableIndividual): number {
  return b.total - a.total || b.sport - a.sport || b.wins - a.wins || a.name.localeCompare(b.name, 'es')
}

export function sortIndividualStandings(rows: IndividualStanding[]): IndividualStanding[] {
  return [...rows].sort((a, b) =>
    compareIndividual(
      { name: a.name, total: a.total_points, sport: a.sport_points, wins: a.wins },
      { name: b.name, total: b.total_points, sport: b.sport_points, wins: b.wins },
    )
  )
}

// Parejas: puntos, luego victorias, luego nombre.
export function sortPairStandings(rows: PairStanding[]): PairStanding[] {
  return [...rows].sort((a, b) =>
    b.points - a.points || b.wins - a.wins ||
    `${a.p1_name} / ${a.p2_name}`.localeCompare(`${b.p1_name} / ${b.p2_name}`, 'es')
  )
}
