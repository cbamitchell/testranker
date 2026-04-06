import { Outlet, Link, useLocation } from 'react-router-dom'
import styles from './Layout.module.css'

export default function Layout() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoIcon}>⚡</span>
          <span className={styles.logoText}>ELO Ranker</span>
        </Link>
        {!isHome && (
          <Link to="/" className={styles.backBtn}>
            ← All Lists
          </Link>
        )}
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
