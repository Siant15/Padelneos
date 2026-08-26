// Tests unitarios de lib/dna.ts — sin dependencias nuevas: usa el test
// runner y el módulo de aserciones integrados en Node (node:test,
// node:assert), disponibles desde Node 18+. Se compilan con el
// `typescript` ya presente en devDependencies y se ejecutan con
// `node --test`; ver scripts/run-dna-tests.sh.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  smoothToNeutral,
  computeVIC,
  computeFOR,
  computeDOM,
  computeCLU,
  computeVER,
  computeOLF,
  type PlayerMatchRecord,
} from './dna'

function match(overrides: Partial<PlayerMatchRecord> = {}): PlayerMatchRecord {
  return { roundNumber: 1, won: true, setsWon: 2, setsLost: 0, setsPlayed: 2, partnerId: 'p2', ...overrides }
}

test('smoothToNeutral: sin muestra devuelve neutral', () => {
  assert.equal(smoothToNeutral(90, 0), 50)
})

test('smoothToNeutral: muestra grande apenas se aleja del valor real', () => {
  const smoothed = smoothToNeutral(100, 30)
  assert.ok(smoothed > 95, `esperaba >95, fue ${smoothed}`)
})

test('smoothToNeutral: muestra pequeña se acerca a 50', () => {
  const smoothed = smoothToNeutral(100, 1)
  assert.ok(smoothed < 75, `esperaba <75 con 1 sola observación, fue ${smoothed}`)
  assert.ok(smoothed > 50)
})

test('VIC: sin partidos jugados -> neutral e insuficiente', () => {
  const r = computeVIC([])
  assert.equal(r.value, 50)
  assert.equal(r.insufficient, true)
})

test('VIC: 100% de victorias con muestra amplia se acerca a 100', () => {
  const matches = Array.from({ length: 12 }, () => match({ won: true }))
  const r = computeVIC(matches)
  assert.ok(r.value >= 90, `esperaba >=90, fue ${r.value}`)
  assert.equal(r.insufficient, false)
})

test('VIC: 50% de victorias da justo 50', () => {
  const matches = [match({ won: true }), match({ won: false })]
  const r = computeVIC(matches)
  assert.equal(r.value, 50)
})

test('VIC: no muestra 0 falso con una sola derrota (se suaviza)', () => {
  const r = computeVIC([match({ won: false })])
  assert.ok(r.value > 0, `esperaba >0 tras suavizado, fue ${r.value}`)
})

test('FOR: sin partidos -> neutral e insuficiente', () => {
  const r = computeFOR([])
  assert.equal(r.value, 50)
  assert.equal(r.insufficient, true)
})

test('FOR: 5 victorias seguidas da 100 y no es insuficiente', () => {
  const matches = Array.from({ length: 5 }, (_, i) => match({ roundNumber: 5 - i, won: true }))
  const r = computeFOR(matches)
  assert.equal(r.value, 100)
  assert.equal(r.insufficient, false)
})

test('FOR: menos de 5 partidos se renormaliza (1 victoria = 100)', () => {
  const r = computeFOR([match({ won: true })])
  assert.equal(r.value, 100)
  assert.equal(r.insufficient, true)
})

test('FOR: el más reciente pesa más que el más antiguo', () => {
  // Gana el más reciente, pierde el resto -> más puntos que al revés.
  const recentWin = computeFOR([
    match({ roundNumber: 5, won: true }),
    match({ roundNumber: 4, won: false }),
    match({ roundNumber: 3, won: false }),
  ])
  const oldWin = computeFOR([
    match({ roundNumber: 5, won: false }),
    match({ roundNumber: 4, won: false }),
    match({ roundNumber: 3, won: true }),
  ])
  assert.ok(recentWin.value > oldWin.value, `${recentWin.value} debería ser mayor que ${oldWin.value}`)
})

test('DOM: sin sets jugados -> neutral e insuficiente', () => {
  const r = computeDOM([])
  assert.equal(r.value, 50)
  assert.equal(r.insufficient, true)
})

test('DOM: domina todos los sets con muestra amplia -> alto', () => {
  const matches = Array.from({ length: 10 }, () => match({ setsWon: 2, setsLost: 0 }))
  const r = computeDOM(matches)
  assert.ok(r.value > 90)
})

test('CLU: sin partidos a 3 sets -> neutral e insuficiente, no 0', () => {
  const r = computeCLU([match({ setsPlayed: 2 })])
  assert.equal(r.value, 50)
  assert.equal(r.insufficient, true)
})

test('CLU: gana varios partidos a 3 sets -> por encima de neutral', () => {
  const matches = Array.from({ length: 6 }, () => match({ setsPlayed: 3, won: true }))
  const r = computeCLU(matches)
  assert.ok(r.value > 50)
  assert.equal(r.insufficient, false)
})

test('VER: sin partidos -> neutral e insuficiente', () => {
  const r = computeVER([], 3)
  assert.equal(r.value, 50)
  assert.equal(r.insufficient, true)
})

test('VER: cobertura completa de compañeros con buen rendimiento -> alto', () => {
  const matches = [
    match({ partnerId: 'a', won: true }),
    match({ partnerId: 'b', won: true }),
    match({ partnerId: 'c', won: true }),
  ]
  const r = computeVER(matches, 3)
  assert.ok(r.value > 70, `esperaba >70, fue ${r.value}`)
  assert.equal(r.insufficient, false)
})

test('VER: cobertura parcial marca insuficiente aunque haya partidos', () => {
  const matches = [match({ partnerId: 'a', won: true }), match({ partnerId: 'a', won: true })]
  const r = computeVER(matches, 3)
  assert.equal(r.insufficient, true)
})

test('OLF: sin apuestas resueltas -> neutral e insuficiente', () => {
  const r = computeOLF(0, 0, 0, [10, -5, 0])
  assert.equal(r.value, 50)
  assert.equal(r.insufficient, true)
})

test('OLF: mejor jugador de la liga (más aciertos y más fichas) -> alto', () => {
  const r = computeOLF(8, 10, 200, [200, -50, 0, 50])
  assert.ok(r.value > 70, `esperaba >70, fue ${r.value}`)
})

test('OLF: todos con la misma rentabilidad no rompe la normalización (no NaN)', () => {
  const r = computeOLF(5, 10, 0, [0, 0, 0, 0])
  assert.ok(Number.isFinite(r.value))
})
