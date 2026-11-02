import { isValidSetScore } from '@/lib/types'

export type SetScore = { t1: string; t2: string }

export type MatchStatus = {
  winner: 'team1' | 'team2' | null
  error: string | null
  needsThirdSet: boolean
  decidedInTwo: boolean
  badSet: number | null
}

export function evaluateSets(sets: SetScore[]): MatchStatus {
  const parsed = sets.map(s => ({
    t1: s.t1.trim() === '' ? null : parseInt(s.t1, 10),
    t2: s.t2.trim() === '' ? null : parseInt(s.t2, 10),
  }))
  const [s1, s2, s3] = parsed
  const notDecided = { winner: null, error: null, needsThirdSet: false, decidedInTwo: false, badSet: null } as const

  if (s1.t1 === null || s1.t2 === null || s2.t1 === null || s2.t2 === null) {
    return notDecided
  }
  if (!isValidSetScore(s1.t1, s1.t2)) {
    return { ...notDecided, badSet: 0, error: `El set 1 (${s1.t1}-${s1.t2}) no es un resultado válido de pádel: 6-0 a 6-4, 7-5 o 7-6` }
  }
  if (!isValidSetScore(s2.t1, s2.t2)) {
    return { ...notDecided, badSet: 1, error: `El set 2 (${s2.t1}-${s2.t2}) no es un resultado válido de pádel: 6-0 a 6-4, 7-5 o 7-6` }
  }

  const w1 = s1.t1 > s1.t2 ? 'team1' : 'team2'
  const w2 = s2.t1 > s2.t2 ? 'team1' : 'team2'
  if (w1 === w2) return { winner: w1, error: null, needsThirdSet: false, decidedInTwo: true, badSet: null }

  // 1-1: hace falta un tercer set decisivo
  if (!s3 || s3.t1 === null || s3.t2 === null) {
    return { ...notDecided, needsThirdSet: true }
  }
  if (!isValidSetScore(s3.t1, s3.t2)) {
    return { ...notDecided, badSet: 2, error: `El set 3 (${s3.t1}-${s3.t2}) no es un resultado válido de pádel: 6-0 a 6-4, 7-5 o 7-6` }
  }
  const w3 = s3.t1 > s3.t2 ? 'team1' : 'team2'
  return { winner: w3, error: null, needsThirdSet: false, decidedInTwo: false, badSet: null }
}
