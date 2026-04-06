import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { db } from '../db/db'
import type { Item } from '../db/db'
import Button from '../components/Button'
import styles from './Analytics.module.css'

export default function Analytics() {
  const { listId } = useParams()
  const id = Number(listId)

  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  const list = useLiveQuery(() => db.lists.get(id), [id])
  const items = useLiveQuery(() =>
    db.items.where('listId').equals(id).toArray().then((arr) => arr.sort((a, b) => b.elo - a.elo)),
    [id]
  )
  const matches = useLiveQuery(() =>
    db.matches.where('listId').equals(id).reverse().toArray(),
    [id]
  )
  const eloHistory = useLiveQuery(() =>
    selectedItem
      ? db.eloHistory.where('itemId').equals(selectedItem.id!).sortBy('timestamp')
      : Promise.resolve([] as import('../db/db').EloHistoryEntry[]),
    [selectedItem?.id]
  )

  async function resetRankings() {
    if (!confirm('Reset all ELO scores, win/loss records, and match history for this list? This cannot be undone.')) return
    const listItems = await db.items.where('listId').equals(id).toArray()
    await Promise.all(
      listItems.map((item) =>
        db.items.update(item.id!, {
          elo: 1000,
          wins: 0,
          losses: 0,
          skips: 0,
          matchCount: 0,
          currentStreak: 0,
          maxStreak: 0,
        })
      )
    )
    await db.matches.where('listId').equals(id).delete()
    await db.eloHistory.where('listId').equals(id).delete()
    setSelectedItem(null)
  }

  if (!items || !matches) return <div className={styles.loading}>Loading…</div>

  const totalMatches = matches.length
  const mostWins = items.reduce((best, item) => item.wins > best.wins ? item : best, items[0])
  const mostLosses = items.reduce((best, item) => item.losses > best.losses ? item : best, items[0])
  const longestStreak = items.reduce((best, item) => item.maxStreak > best.maxStreak ? item : best, items[0])

  const historyChartData = eloHistory?.map((h, i) => ({
    match: i + 1,
    elo: h.elo,
  })) ?? []

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{list?.name} — Analytics</h1>
          <p className={styles.subtitle}>{totalMatches} total matches played</p>
        </div>
        <div className={styles.actions}>
          <Link to={`/list/${id}/results`}>
            <Button size="sm">📊 Results</Button>
          </Link>
          <Link to={`/list/${id}/rank`}>
            <Button variant="primary" size="sm">⚡ Rank</Button>
          </Link>
          <Button variant="danger" size="sm" onClick={resetRankings}>↺ Reset</Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{totalMatches}</span>
          <span className={styles.statLabel}>Total Matches</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{items.length}</span>
          <span className={styles.statLabel}>Items Ranked</span>
        </div>
        {items.length > 0 && (
          <>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{items[0]?.name}</span>
              <span className={styles.statLabel}>🥇 Current #1</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{mostWins?.name}</span>
              <span className={styles.statLabel}>Most Wins ({mostWins?.wins})</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{longestStreak?.name}</span>
              <span className={styles.statLabel}>Longest Streak ({longestStreak?.maxStreak})</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{mostLosses?.name}</span>
              <span className={styles.statLabel}>Most Losses ({mostLosses?.losses})</span>
            </div>
          </>
        )}
      </div>

      {/* Per-item section */}
      <div className={styles.twoCol}>
        {/* Item list */}
        <div className={styles.itemPanel}>
          <h2 className={styles.panelTitle}>Item Stats</h2>
          <div className={styles.itemList}>
            {items.map((item, i) => {
              const winRate = item.matchCount > 0 ? ((item.wins / item.matchCount) * 100).toFixed(0) : '—'
              return (
                <button
                  key={item.id}
                  className={`${styles.itemRow} ${selectedItem?.id === item.id ? styles.itemRowActive : ''}`}
                  onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                >
                  <span className={styles.itemRank}>#{i + 1}</span>
                  <div className={styles.itemMeta}>
                    <span className={styles.itemName}>{item.name}</span>
                    <span className={styles.itemRecord}>{item.wins}W / {item.losses}L · {winRate}% WR · Streak: {item.maxStreak}</span>
                  </div>
                  <span className={styles.itemElo}>{item.elo}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ELO history chart for selected item */}
        <div className={styles.chartPanel}>
          <h2 className={styles.panelTitle}>
            {selectedItem ? `${selectedItem.name} — ELO History` : 'Select an item to see history'}
          </h2>
          {selectedItem && historyChartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={historyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a44" />
                <XAxis dataKey="match" label={{ value: 'Match #', position: 'insideBottom', offset: -2, fill: '#9898c0', fontSize: 11 }} tick={{ fill: '#9898c0', fontSize: 11 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#9898c0', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#252540', border: '1px solid #3a3a5c', borderRadius: 8, color: '#e8e8f4' }}
                  formatter={(v) => [`${v} ELO`, '']}
                  labelFormatter={(l) => `Match #${l}`}
                />
                <Line type="monotone" dataKey="elo" stroke="#7c6af7" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : selectedItem ? (
            <div className={styles.noHistory}>Not enough match history yet. Play more matches!</div>
          ) : (
            <div className={styles.noHistory}>Click an item on the left to see its ELO progression over time.</div>
          )}

          {/* Match history for selected item */}
          {selectedItem && (
            <div className={styles.matchHistory}>
              <h3 className={styles.matchHistoryTitle}>Recent Matches</h3>
              {matches
                .filter((m) => m.winnerId === selectedItem.id || m.loserId === selectedItem.id)
                .slice(0, 15)
                .map((m) => {
                  const won = m.winnerId === selectedItem.id
                  const opponent = won ? m.loserName : m.winnerName
                  const eloBefore = won ? m.winnerEloBefore : m.loserEloBefore
                  const eloAfter = won ? m.winnerEloAfter : m.loserEloAfter
                  const delta = eloAfter - eloBefore
                  return (
                    <div key={m.id} className={`${styles.matchRow} ${won ? styles.matchWon : styles.matchLost}`}>
                      <span className={styles.matchResult}>{won ? '✓ W' : '✗ L'}</span>
                      <span className={styles.matchOpponent}>vs {opponent}</span>
                      <span className={styles.matchDelta}>{delta > 0 ? '+' : ''}{delta}</span>
                      <span className={styles.matchElo}>{eloAfter} ELO</span>
                    </div>
                  )
                })}
              {matches.filter((m) => m.winnerId === selectedItem.id || m.loserId === selectedItem.id).length === 0 && (
                <div className={styles.noHistory}>No matches yet for this item.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
