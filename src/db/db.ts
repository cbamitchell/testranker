import Dexie, { type Table } from 'dexie'

export interface RankingList {
  id?: number
  name: string
  description: string
  createdAt: Date
  updatedAt: Date
  kFactor: number
}

export interface Item {
  id?: number
  listId: number
  name: string
  description: string
  imageData: string | null
  tags: string[]
  url: string | null
  elo: number
  wins: number
  losses: number
  skips: number
  matchCount: number
  currentStreak: number
  maxStreak: number
  skipped: boolean
  createdAt: Date
}

export interface Match {
  id?: number
  listId: number
  winnerId: number
  loserId: number
  winnerName: string
  loserName: string
  winnerEloBefore: number
  loserEloBefore: number
  winnerEloAfter: number
  loserEloAfter: number
  timestamp: Date
}

export interface EloHistoryEntry {
  id?: number
  itemId: number
  listId: number
  elo: number
  timestamp: Date
}

class EloRankerDB extends Dexie {
  lists!: Table<RankingList>
  items!: Table<Item>
  matches!: Table<Match>
  eloHistory!: Table<EloHistoryEntry>

  constructor() {
    super('EloRankerDB')
    this.version(1).stores({
      lists: '++id, name, createdAt',
      items: '++id, listId, name, elo',
      matches: '++id, listId, winnerId, loserId, timestamp',
      eloHistory: '++id, itemId, listId, timestamp',
    })
  }
}

export const db = new EloRankerDB()
