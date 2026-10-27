// Informe de mitad de temporada: títulos a partir de los partidos y de las
// preguntas anecdóticas de las apuestas ("primero en…"). Cada pregunta
// resuelta aporta 1 al jugador que fue el protagonista. Lo positivo o
// negativo de cada pregunta ya lo marca la propia app con `allow_self_bet`
// (se puede apostar por uno mismo = positiva; si no, negativa).

export type InformeEvent = { playerId: string; templateText: string; positive: boolean }

export type InformePlayer = { id: string; name: string; wins: number; losses: number }

export type InformeRow = { playerId: string; name: string; score: number; detail: string }

export type InformeTitle = {
  key: string
  emoji: string
  title: string
  rule: string
  rows: InformeRow[]
  winners: string[]
  hasData: boolean
}

// Cómo se llama cada tipo de "primero en…" al contarlo.
const KINDS: { re: RegExp; singular: string; plural: string }[] = [
  { re: /hace un ace/i, singular: 'ace', plural: 'aces' },
  { re: /smash ganador/i, singular: 'smash ganador', plural: 'smashes ganadores' },
  { re: /doble falta/i, singular: 'doble falta', plural: 'dobles faltas' },
  { re: /smash al cristal/i, singular: 'smash al cristal', plural: 'smashes al cristal' },
  { re: /llegar tarde/i, singular: 'llegada tarde', plural: 'llegadas tarde' },
  { re: /cantada/i, singular: 'cantada fallada', plural: 'cantadas falladas' },
  { re: /pelotazo/i, singular: 'pelotazo recibido', plural: 'pelotazos recibidos' },
]

function kindOf(text: string): { singular: string; plural: string } {
  return KINDS.find(k => k.re.test(text)) ?? { singular: text.toLowerCase(), plural: text.toLowerCase() }
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

function breakdown(parts: { n: number; singular: string; plural: string }[]): string {
  return parts.filter(p => p.n > 0).map(p => plural(p.n, p.singular, p.plural)).join(' · ')
}

function rank(rows: InformeRow[]): { rows: InformeRow[]; winners: string[]; hasData: boolean } {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es'))
  const top = sorted[0]?.score ?? 0
  return { rows: sorted, winners: top > 0 ? sorted.filter(r => r.score === top).map(r => r.name) : [], hasData: top > 0 }
}

// Un título "simple": cuenta cuántas veces un jugador fue protagonista de un tipo de pregunta.
function simpleTitle(
  key: string, emoji: string, title: string, rule: string, matcher: RegExp,
  players: InformePlayer[], events: InformeEvent[],
): InformeTitle {
  const rows = players.map(p => ({
    playerId: p.id,
    name: p.name,
    score: events.filter(e => e.playerId === p.id && matcher.test(e.templateText)).length,
    detail: '',
  }))
  return { key, emoji, title, rule, ...rank(rows) }
}

export function computeInforme(players: InformePlayer[], events: InformeEvent[]): InformeTitle[] {
  // MVP: partidos ganados + "primeros" positivos (aces, smash ganadores…).
  const mvpRows = players.map(p => {
    const mine = events.filter(e => e.playerId === p.id && e.positive)
    const kinds = new Map<string, { n: number; singular: string; plural: string }>()
    for (const e of mine) {
      const k = kindOf(e.templateText)
      const cur = kinds.get(k.singular) ?? { n: 0, ...k }
      cur.n++
      kinds.set(k.singular, cur)
    }
    return {
      playerId: p.id,
      name: p.name,
      score: p.wins + mine.length,
      detail: breakdown([{ n: p.wins, singular: 'victoria', plural: 'victorias' }, ...kinds.values()]),
    }
  })

  // Rey del error: partidos perdidos + "primeros" negativos (doble falta, smash al cristal…).
  const errorRows = players.map(p => {
    const mine = events.filter(e => e.playerId === p.id && !e.positive)
    const kinds = new Map<string, { n: number; singular: string; plural: string }>()
    for (const e of mine) {
      const k = kindOf(e.templateText)
      const cur = kinds.get(k.singular) ?? { n: 0, ...k }
      cur.n++
      kinds.set(k.singular, cur)
    }
    return {
      playerId: p.id,
      name: p.name,
      score: p.losses + mine.length,
      detail: breakdown([{ n: p.losses, singular: 'derrota', plural: 'derrotas' }, ...kinds.values()]),
    }
  })

  return [
    {
      key: 'mvp', emoji: '🏆', title: 'MVP de la liga',
      rule: 'Partidos ganados + veces que fue el primero en las jugadas buenas (ace, smash ganador…).',
      ...rank(mvpRows),
    },
    {
      key: 'error', emoji: '🤦', title: 'Rey del error',
      rule: 'Partidos perdidos + veces que fue el primero en las jugadas malas (doble falta, smash al cristal, llegar tarde, cantada fallada…).',
      ...rank(errorRows),
    },
    simpleTitle('sacador', '🎯', 'Mejor sacador', 'Veces que fue el primero en hacer un ace.', /hace un ace/i, players, events),
    simpleTitle('peor-sacador', '🙈', 'Peor sacador', 'Veces que fue el primero en cometer una doble falta.', /doble falta/i, players, events),
    simpleTitle('remate', '💥', 'Rey del remate', 'Veces que fue el primero en hacer un smash ganador.', /smash ganador/i, players, events),
    simpleTitle('reloj', '⏰', 'Reloj roto', 'Veces que fue el primero en llegar tarde.', /llegar tarde/i, players, events),
  ]
}
