// ─── "ADN competitivo": seis ejes calculados a partir de datos que la
// app ya registra (partidos, sets, apuestas) — sin inputs manuales ni
// estadísticas golpe a golpe. Funciones puras, sin I/O, para que sean
// testeables de forma aislada (ver lib/dna.test.ts).

export type PlayerMatchRecord = {
  roundNumber: number
  won: boolean
  setsWon: number
  setsLost: number
  setsPlayed: 2 | 3
  partnerId: string
}

export type AxisResult = { value: number; insufficient: boolean }

export type DnaAxes = {
  vic: AxisResult
  for: AxisResult
  dom: AxisResult
  clu: AxisResult
  ver: AxisResult
  olf: AxisResult
}

const NEUTRAL = 50

function clampRound(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)))
}

// Suaviza un valor calculado hacia la referencia neutral (50) cuando la
// muestra es pequeña, para que un único partido/apuesta no produzca un
// valor extremo engañoso (0 o 100). `k` controla cuántas observaciones
// hacen falta para que el suavizado deje de notarse — con k=3, una
// muestra de 3 ya pesa el 50% del valor real y con 9+ apenas se nota.
export function smoothToNeutral(rawValue: number, sampleSize: number, k = 3, neutral = NEUTRAL): number {
  if (sampleSize <= 0) return neutral
  const weight = sampleSize / (sampleSize + k)
  return neutral + (rawValue - neutral) * weight
}

// VIC — Victorias: partidos ganados / jugados, sobre partidos
// finalizados de la temporada actual únicamente.
export function computeVIC(matches: PlayerMatchRecord[]): AxisResult {
  const played = matches.length
  if (played === 0) return { value: NEUTRAL, insufficient: true }
  const wins = matches.filter(m => m.won).length
  const raw = (wins / played) * 100
  return { value: clampRound(smoothToNeutral(raw, played)), insufficient: false }
}

// FOR — Forma: media ponderada de los últimos 5 partidos, del más
// reciente al más antiguo. `matchesDesc` debe venir ya ordenado de más
// reciente a más antiguo. Con menos de 5 partidos se renormaliza usando
// solo los pesos disponibles, para conservar la escala 0–100.
const FOR_WEIGHTS = [35, 25, 18, 13, 9]

export function computeFOR(matchesDesc: PlayerMatchRecord[]): AxisResult {
  const last5 = matchesDesc.slice(0, 5)
  if (last5.length === 0) return { value: NEUTRAL, insufficient: true }
  const weights = FOR_WEIGHTS.slice(0, last5.length)
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const scored = last5.reduce((s, m, i) => s + (m.won ? weights[i] : 0), 0)
  const raw = (scored / totalWeight) * 100
  return { value: clampRound(raw), insufficient: last5.length < 5 }
}

// DOM — Dominio: sets ganados / sets jugados, sobre partidos
// finalizados de la temporada actual.
export function computeDOM(matches: PlayerMatchRecord[]): AxisResult {
  const setsPlayed = matches.reduce((s, m) => s + m.setsWon + m.setsLost, 0)
  if (setsPlayed === 0) return { value: NEUTRAL, insufficient: true }
  const setsWon = matches.reduce((s, m) => s + m.setsWon, 0)
  const raw = (setsWon / setsPlayed) * 100
  return { value: clampRound(smoothToNeutral(raw, setsPlayed)), insufficient: false }
}

// CLU — Clutch: partidos a 3 sets ganados / partidos a 3 sets jugados.
// Sin partidos a tres sets se muestra la referencia neutral y se marca
// la muestra como insuficiente, en vez de un 0 falso.
export function computeCLU(matches: PlayerMatchRecord[]): AxisResult {
  const threeSet = matches.filter(m => m.setsPlayed === 3)
  if (threeSet.length === 0) return { value: NEUTRAL, insufficient: true }
  const won = threeSet.filter(m => m.won).length
  const raw = (won / threeSet.length) * 100
  return { value: clampRound(smoothToNeutral(raw, threeSet.length)), insufficient: false }
}

// VER — Versatilidad: 50% cobertura de compañeros distintos (sobre los
// compañeros posibles en la temporada) + 50% rendimiento medio con cada
// compañero (media de los % de victorias por compañero, no ponderada
// por número de partidos, para que un compañero con muchos partidos no
// tape el rendimiento con los demás).
export function computeVER(matches: PlayerMatchRecord[], possiblePartners: number): AxisResult {
  if (matches.length === 0 || possiblePartners <= 0) return { value: NEUTRAL, insufficient: true }

  const byPartner = new Map<string, { wins: number; total: number }>()
  for (const m of matches) {
    const cur = byPartner.get(m.partnerId) ?? { wins: 0, total: 0 }
    cur.total++
    if (m.won) cur.wins++
    byPartner.set(m.partnerId, cur)
  }

  const coverage = Math.min(1, byPartner.size / possiblePartners) * 100
  const perPartnerWinPct = [...byPartner.values()].map(p => (p.wins / p.total) * 100)
  const avgPerformance = perPartnerWinPct.reduce((s, v) => s + v, 0) / perPartnerWinPct.length
  const raw = 0.5 * coverage + 0.5 * avgPerformance

  return { value: clampRound(smoothToNeutral(raw, matches.length)), insufficient: byPartner.size < possiblePartners }
}

// OLF — Olfato: 50% % de aciertos + 50% rentabilidad en fichas,
// normalizada respecto al resto de jugadores de la misma liga (min-max
// sobre el total de la temporada) para mantenerla entre 0 y 100. Solo
// cuenta apuestas ya resueltas.
export function computeOLF(
  playerCorrect: number,
  playerMarketsBet: number,
  playerChipsNet: number,
  leagueChipsNetTotals: number[]
): AxisResult {
  if (playerMarketsBet === 0) return { value: NEUTRAL, insufficient: true }

  const accuracyRaw = (playerCorrect / playerMarketsBet) * 100
  const min = Math.min(...leagueChipsNetTotals, playerChipsNet)
  const max = Math.max(...leagueChipsNetTotals, playerChipsNet)
  const profitabilityNorm = max === min ? NEUTRAL : ((playerChipsNet - min) / (max - min)) * 100
  const raw = 0.5 * accuracyRaw + 0.5 * profitabilityNorm

  return { value: clampRound(smoothToNeutral(raw, playerMarketsBet)), insufficient: false }
}

export function computeCompetitiveDna(input: {
  matches: PlayerMatchRecord[]
  matchesDesc: PlayerMatchRecord[]
  possiblePartners: number
  correctCount: number
  marketsBet: number
  chipsNet: number
  leagueChipsNetTotals: number[]
}): DnaAxes {
  return {
    vic: computeVIC(input.matches),
    for: computeFOR(input.matchesDesc),
    dom: computeDOM(input.matches),
    clu: computeCLU(input.matches),
    ver: computeVER(input.matches, input.possiblePartners),
    olf: computeOLF(input.correctCount, input.marketsBet, input.chipsNet, input.leagueChipsNetTotals),
  }
}

export const DNA_AXES = [
  { key: 'vic', label: 'VIC', name: 'Victorias', note: 'Porcentaje de partidos que has ganado.', formula: 'Victorias ÷ partidos jugados.' },
  { key: 'for', label: 'FOR', name: 'Forma', note: 'Tu rendimiento ponderado en los últimos cinco partidos.', formula: 'Resultados ponderados de los últimos cinco partidos.' },
  { key: 'dom', label: 'DOM', name: 'Dominio', note: 'Porcentaje de sets que consigues ganar.', formula: 'Sets ganados ÷ sets jugados.' },
  { key: 'clu', label: 'CLU', name: 'Clutch', note: 'Cómo rindes en partidos decididos en el tercer set.', formula: 'Victorias 2–1 ÷ partidos terminados en tres sets.' },
  { key: 'ver', label: 'VER', name: 'Versatilidad', note: 'Qué bien compites con compañeros diferentes.', formula: 'Rendimiento jugando con diferentes compañeros.' },
  { key: 'olf', label: 'OLF', name: 'Olfato', note: 'Tu acierto y rentabilidad en las apuestas.', formula: 'Aciertos y rentabilidad en las apuestas.' },
] as const

export type DnaAxisKey = typeof DNA_AXES[number]['key']
