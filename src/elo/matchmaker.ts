import type { Item } from '../db/db'

interface MatchPair {
  a: Item
  b: Item
  score: number
}

/**
 * Smart matchmaking: prioritise pairs with fewest combined matches
 * and similar ELO scores, weighted together.
 */
export function selectNextPair(items: Item[]): [Item, Item] | null {
  const active = items.filter((i) => !i.skipped)
  if (active.length < 2) return null

  const candidates: MatchPair[] = []

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      const eloDiff = Math.abs(a.elo - b.elo)
      const combinedMatches = a.matchCount + b.matchCount

      // Lower score = better pair (fewer matches + closer ELO)
      const score = combinedMatches * 10 + eloDiff / 40
      candidates.push({ a, b, score })
    }
  }

  candidates.sort((x, y) => x.score - y.score)

  // Pick randomly from the top 20% of candidates to add variety
  const topN = Math.max(1, Math.floor(candidates.length * 0.2))
  const pick = candidates[Math.floor(Math.random() * topN)]

  return [pick.a, pick.b]
}

/**
 * Returns true when every active item has a unique ELO score.
 */
export function isSessionComplete(items: Item[]): boolean {
  const active = items.filter((i) => !i.skipped)
  if (active.length === 0) return true
  const scores = active.map((i) => i.elo)
  return new Set(scores).size === active.length
}
