import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { db } from '../db/db'
import type { Item } from '../db/db'
import Button from '../components/Button'
import styles from './Results.module.css'

type View = 'leaderboard' | 'tierlist' | 'chart'

const TIER_CONFIG = [
  { tier: 'S', min: 0.8, color: '#ff7043', bg: '#3d1a12' },
  { tier: 'A', min: 0.6, color: '#ffa726', bg: '#3d2a10' },
  { tier: 'B', min: 0.4, color: '#66bb6a', bg: '#0e2e14' },
  { tier: 'C', min: 0.2, color: '#42a5f5', bg: '#0d1e38' },
  { tier: 'D', min: 0,   color: '#ab47bc', bg: '#25103c' },
]

function assignTiers(items: Item[]): Map<string, Item[]> {
  if (items.length === 0) return new Map()
  const sorted = [...items].sort((a, b) => b.elo - a.elo)
  const maxElo = sorted[0].elo
  const minElo = sorted[sorted.length - 1].elo
  const range = maxElo - minElo || 1

  const result = new Map(TIER_CONFIG.map((t) => [t.tier, [] as Item[]]))
  for (const item of sorted) {
    const pct = (item.elo - minElo) / range
    const tier = TIER_CONFIG.find((t) => pct >= t.min) ?? TIER_CONFIG[TIER_CONFIG.length - 1]
    result.get(tier.tier)!.push(item)
  }
  return result
}

export default function Results() {
  const { listId } = useParams()
  const id = Number(listId)
  const [view, setView] = useState<View>('leaderboard')
  const resultRef = useRef<HTMLDivElement>(null)

  const list = useLiveQuery(() => db.lists.get(id), [id])
  const items = useLiveQuery(() =>
    db.items.where('listId').equals(id).toArray().then((arr) => arr.sort((a, b) => b.elo - a.elo)),
    [id]
  )

  async function shareAsImage() {
    if (!resultRef.current) return
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(resultRef.current, {
        backgroundColor: '#1a1a2e',
        scale: 2,
        useCORS: true,
      })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `${list?.name || 'rankings'}_results.png`
      a.click()
    } catch (e) {
      console.error('Share as image failed', e)
    }
  }

  if (!items) return <div className={styles.loading}>Loading…</div>

  const tiers = assignTiers(items)
  const chartData = items.slice(0, 20).map((item) => ({
    name: item.name.length > 14 ? item.name.slice(0, 14) + '…' : item.name,
    elo: item.elo,
  }))

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{list?.name}</h1>
          <p className={styles.subtitle}>{items.length} items ranked</p>
        </div>
        <div className={styles.actions}>
          <Link to={`/list/${id}/rank`}>
            <Button variant="primary" size="sm">⚡ Keep Ranking</Button>
          </Link>
          <Link to={`/list/${id}/analytics`}>
            <Button size="sm">📈 Analytics</Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={shareAsImage}>📷 Share</Button>
        </div>
      </div>

      <div className={styles.tabs}>
        {(['leaderboard', 'tierlist', 'chart'] as View[]).map((v) => (
          <button
            key={v}
            className={`${styles.tab} ${view === v ? styles.tabActive : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'leaderboard' ? '🏆 Leaderboard' : v === 'tierlist' ? '🎯 Tier List' : '📊 Chart'}
          </button>
        ))}
      </div>

      <div ref={resultRef} className={styles.resultContent}>
        {view === 'leaderboard' && (
          <div className={styles.leaderboard}>
            {items.map((item, i) => (
              <div key={item.id} className={`${styles.row} ${i < 3 ? styles.topRow : ''}`}>
                <span className={styles.rank}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </span>
                {item.imageData && (
                  <img src={item.imageData} className={styles.thumb} alt="" />
                )}
                {!item.imageData && (
                  <div className={styles.thumbPlaceholder}>{item.name.charAt(0)}</div>
                )}
                <div className={styles.rowInfo}>
                  <span className={styles.rowName}>{item.name}</span>
                  {item.tags.length > 0 && (
                    <div className={styles.tags}>
                      {item.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                    </div>
                  )}
                </div>
                <div className={styles.rowStats}>
                  <span className={styles.elo}>{item.elo}</span>
                  <span className={styles.record}>{item.wins}W/{item.losses}L</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'tierlist' && (
          <div className={styles.tierList}>
            {TIER_CONFIG.map(({ tier, color, bg }) => {
              const tierItems = tiers.get(tier) ?? []
              if (tierItems.length === 0) return null
              return (
                <div key={tier} className={styles.tierRow} style={{ borderColor: color }}>
                  <div className={styles.tierLabel} style={{ background: color }}>
                    {tier}
                  </div>
                  <div className={styles.tierItems} style={{ background: bg }}>
                    {tierItems.map((item) => (
                      <div key={item.id} className={styles.tierItem}>
                        {item.imageData && (
                          <img src={item.imageData} className={styles.tierThumb} alt="" />
                        )}
                        <span className={styles.tierItemName}>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {view === 'chart' && (
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 10 }}>
                <XAxis type="number" domain={['auto', 'auto']} tick={{ fill: '#9898c0', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#e8e8f4', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#252540', border: '1px solid #3a3a5c', borderRadius: 8, color: '#e8e8f4' }}
                  cursor={{ fill: 'rgba(124,106,247,0.1)' }}
                  formatter={(v) => [`${v} ELO`, '']}
                />
                <Bar dataKey="elo" radius={[0, 6, 6, 0]}>
                  {chartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#7c6af7'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {items.length > 20 && (
              <p className={styles.chartNote}>Showing top 20 of {items.length} items</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
