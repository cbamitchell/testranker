import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import Button from '../components/Button'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const lists = useLiveQuery(() => db.lists.orderBy('updatedAt').reverse().toArray(), [])
  const itemCounts = useLiveQuery(async () => {
    const all = await db.items.toArray()
    const counts: Record<number, number> = {}
    for (const item of all) {
      counts[item.listId] = (counts[item.listId] || 0) + 1
    }
    return counts
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My Ranking Lists</h1>
          <p className={styles.subtitle}>Head-to-head ELO ranking for anything</p>
        </div>
        <Link to="/list/new">
          <Button variant="primary">+ New List</Button>
        </Link>
      </div>

      {lists?.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🏆</div>
          <h2>No lists yet</h2>
          <p>Create your first ranking list to get started</p>
          <Link to="/list/new">
            <Button variant="primary" size="lg">Create a List</Button>
          </Link>
        </div>
      )}

      <div className={styles.grid}>
        {lists?.map((list) => (
          <div key={list.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{list.name}</h2>
              {list.description && (
                <p className={styles.cardDesc}>{list.description}</p>
              )}
            </div>
            <div className={styles.cardMeta}>
              <span className={styles.metaBadge}>
                {itemCounts?.[list.id!] ?? 0} items
              </span>
              <span className={styles.metaDate}>
                {new Date(list.updatedAt).toLocaleDateString()}
              </span>
            </div>
            <div className={styles.cardActions}>
              <Link to={`/list/${list.id}/rank`}>
                <Button variant="primary" size="sm">⚡ Rank</Button>
              </Link>
              <Link to={`/list/${list.id}/results`}>
                <Button size="sm">📊 Results</Button>
              </Link>
              <Link to={`/list/${list.id}/analytics`}>
                <Button size="sm">📈 Stats</Button>
              </Link>
              <Link to={`/list/${list.id}/edit`}>
                <Button variant="ghost" size="sm">✏️ Edit</Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
