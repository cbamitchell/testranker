import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Item } from '../db/db'
import { newRatings } from '../elo/calculator'
import { selectNextPair, isSessionComplete } from '../elo/matchmaker'
import Button from '../components/Button'
import styles from './RankingSession.module.css'

interface MatchRecord {
  winnerId: number
  loserId: number
  winnerEloBefore: number
  loserEloBefore: number
  winnerEloAfter: number
  loserEloAfter: number
  winnerName: string
  loserName: string
}

export default function RankingSession() {
  const { listId } = useParams()
  const id = Number(listId)

  const list = useLiveQuery(() => db.lists.get(id), [id])
  const allItems = useLiveQuery(() => db.items.where('listId').equals(id).toArray(), [id])

  const [pair, setPair] = useState<[Item, Item] | null>(null)
  const [sessionDone, setSessionDone] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [history, setHistory] = useState<MatchRecord[]>([])
  const [choosing, setChoosing] = useState<number | null>(null)
  const [lastResult, setLastResult] = useState<{ winner: string; loser: string; delta: number } | null>(null)

  const pickPair = useCallback((items: Item[]) => {
    if (isSessionComplete(items)) {
      setSessionDone(true)
      setPair(null)
      return
    }
    const next = selectNextPair(items)
    setPair(next)
  }, [])

  useEffect(() => {
    if (allItems && allItems.length >= 2) {
      pickPair(allItems)
    }
  }, [allItems, pickPair])

  async function vote(winnerId: number, loserId: number) {
    if (!allItems || !list || choosing !== null) return
    setChoosing(winnerId)

    const winner = allItems.find((i) => i.id === winnerId)!
    const loser = allItems.find((i) => i.id === loserId)!
    const { winnerNew, loserNew } = newRatings(winner.elo, loser.elo, list.kFactor)
    const delta = winnerNew - winner.elo

    const record: MatchRecord = {
      winnerId,
      loserId,
      winnerEloBefore: winner.elo,
      loserEloBefore: loser.elo,
      winnerEloAfter: winnerNew,
      loserEloAfter: loserNew,
      winnerName: winner.name,
      loserName: loser.name,
    }

    // Update DB
    await Promise.all([
      db.items.update(winnerId, {
        elo: winnerNew,
        wins: winner.wins + 1,
        matchCount: winner.matchCount + 1,
        currentStreak: winner.currentStreak + 1,
        maxStreak: Math.max(winner.maxStreak, winner.currentStreak + 1),
      }),
      db.items.update(loserId, {
        elo: loserNew,
        losses: loser.losses + 1,
        matchCount: loser.matchCount + 1,
        currentStreak: 0,
      }),
      db.matches.add({
        listId: id,
        winnerId,
        loserId,
        winnerName: winner.name,
        loserName: loser.name,
        winnerEloBefore: winner.elo,
        loserEloBefore: loser.elo,
        winnerEloAfter: winnerNew,
        loserEloAfter: loserNew,
        timestamp: new Date(),
      }),
      db.eloHistory.add({ itemId: winnerId, listId: id, elo: winnerNew, timestamp: new Date() }),
      db.eloHistory.add({ itemId: loserId, listId: id, elo: loserNew, timestamp: new Date() }),
      db.lists.update(id, { updatedAt: new Date() }),
    ])

    setHistory((h) => [...h, record])
    setMatchCount((c) => c + 1)
    setLastResult({ winner: winner.name, loser: loser.name, delta })
    setChoosing(null)
  }

  async function undoLast() {
    const last = history[history.length - 1]
    if (!last) return

    await Promise.all([
      db.items.update(last.winnerId, async (item: Item) => {
        item.elo = last.winnerEloBefore
        item.wins = Math.max(0, item.wins - 1)
        item.matchCount = Math.max(0, item.matchCount - 1)
        item.currentStreak = Math.max(0, item.currentStreak - 1)
      }),
      db.items.update(last.loserId, async (item: Item) => {
        item.elo = last.loserEloBefore
        item.losses = Math.max(0, item.losses - 1)
        item.matchCount = Math.max(0, item.matchCount - 1)
      }),
    ])

    // Remove last match record from DB
    const lastMatch = await db.matches
      .where('listId').equals(id)
      .and((m) => m.winnerId === last.winnerId && m.loserId === last.loserId)
      .last()
    if (lastMatch?.id) await db.matches.delete(lastMatch.id)

    // Remove last 2 history entries
    const lastHistory = await db.eloHistory
      .where('listId').equals(id)
      .reverse()
      .limit(2)
      .toArray()
    for (const h of lastHistory) if (h.id) await db.eloHistory.delete(h.id)

    setHistory((h) => h.slice(0, -1))
    setMatchCount((c) => Math.max(0, c - 1))
    setLastResult(null)
    setSessionDone(false)
  }

  async function skipPair() {
    if (!allItems) return
    pickPair(allItems)
  }

  async function toggleSkipItem(item: Item) {
    await db.items.update(item.id!, { skipped: !item.skipped })
  }

  if (!allItems) return <div className={styles.loading}>Loading…</div>

  if (allItems.length < 2) {
    return (
      <div className={styles.insufficient}>
        <div className={styles.insufficientIcon}>⚠️</div>
        <h2>Not enough items</h2>
        <p>You need at least 2 items to start ranking.</p>
        <Link to={`/list/${id}/edit`}>
          <Button variant="primary">Add Items</Button>
        </Link>
      </div>
    )
  }

  const activeItems = allItems.filter((i) => !i.skipped)

  if (sessionDone) {
    return (
      <div className={styles.done}>
        <div className={styles.doneIcon}>🏆</div>
        <h2 className={styles.doneTitle}>Rankings settled!</h2>
        <p className={styles.doneSubtitle}>
          Every item has a unique ELO score after {matchCount} match{matchCount !== 1 ? 'es' : ''}.
        </p>
        <div className={styles.doneActions}>
          <Link to={`/list/${id}/results`}>
            <Button variant="primary" size="lg">View Results</Button>
          </Link>
          <Button size="lg" onClick={() => { setSessionDone(false); if (allItems) pickPair(allItems) }}>
            Keep Ranking
          </Button>
          {history.length > 0 && (
            <Button variant="ghost" onClick={undoLast}>↩ Undo Last</Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.listName}>{list?.name}</h1>
        <div className={styles.headerRight}>
          <span className={styles.matchBadge}>{matchCount} matches</span>
          <Link to={`/list/${id}/results`}>
            <Button variant="ghost" size="sm">📊 Results</Button>
          </Link>
        </div>
      </div>

      {lastResult && (
        <div className={styles.lastResult}>
          <span className={styles.winnerLabel}>✓ {lastResult.winner}</span>
          <span className={styles.deltaLabel}>+{lastResult.delta} ELO</span>
        </div>
      )}

      <div className={styles.prompt}>Which do you prefer?</div>

      {pair && (
        <div className={styles.arena}>
          {([pair[0], pair[1]] as Item[]).map((item, idx) => {
            const other = idx === 0 ? pair[1] : pair[0]
            return (
              <button
                key={item.id}
                className={`${styles.card} ${choosing === item.id ? styles.cardWinning : ''} ${choosing === other.id ? styles.cardLosing : ''}`}
                onClick={() => vote(item.id!, other.id!)}
                disabled={choosing !== null}
              >
                {item.imageData && (
                  <img src={item.imageData} className={styles.cardImage} alt={item.name} />
                )}
                {!item.imageData && (
                  <div className={styles.cardImagePlaceholder}>
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={styles.cardContent}>
                  <h2 className={styles.cardName}>{item.name}</h2>
                  {item.description && <p className={styles.cardDesc}>{item.description}</p>}
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.cardUrl} onClick={(e) => e.stopPropagation()}>
                      🔗 Link
                    </a>
                  )}
                  <div className={styles.cardMeta}>
                    <span className={styles.eloChip}>{item.elo} ELO</span>
                    <span className={styles.recordChip}>{item.wins}W / {item.losses}L</span>
                  </div>
                </div>
                <div className={styles.cardVsOverlay}>
                  {choosing === item.id ? '✓' : 'Pick'}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className={styles.vsLabel}>VS</div>

      <div className={styles.controls}>
        <Button variant="ghost" size="sm" onClick={skipPair}>⏭ Skip Pair</Button>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" onClick={undoLast}>↩ Undo</Button>
        )}
      </div>

      {/* Skip item toggles */}
      <details className={styles.skipSection}>
        <summary className={styles.skipSummary}>Manage items ({activeItems.length} active)</summary>
        <div className={styles.skipList}>
          {allItems.map((item) => (
            <label key={item.id} className={styles.skipItem}>
              <input
                type="checkbox"
                checked={!item.skipped}
                onChange={() => toggleSkipItem(item)}
              />
              <span className={item.skipped ? styles.skippedName : ''}>{item.name}</span>
              <span className={styles.skipElo}>{item.elo}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  )
}
