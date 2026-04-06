export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

export function newRatings(
  winnerRating: number,
  loserRating: number,
  kFactor: number
): { winnerNew: number; loserNew: number } {
  const expectedWinner = expectedScore(winnerRating, loserRating)
  const expectedLoser = expectedScore(loserRating, winnerRating)
  return {
    winnerNew: Math.round(winnerRating + kFactor * (1 - expectedWinner)),
    loserNew: Math.round(loserRating + kFactor * (0 - expectedLoser)),
  }
}

export const DEFAULT_ELO = 1000
export const DEFAULT_K = 32
