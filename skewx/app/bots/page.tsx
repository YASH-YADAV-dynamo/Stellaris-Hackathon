'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/store/useAppStore';
import styles from './page.module.css';

const BotsDashboard = dynamic(() => import('@/components/BotsDashboard'), { ssr: false });

export default function BotsPage() {
  const darkMode = useAppStore(s => s.darkMode);
  const toggleDarkMode = useAppStore(s => s.toggleDarkMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          <span className={styles.navDot} />
          <span className={styles.navTitle}>Trading Bots</span>
          <span className={styles.navBadge}>DXD</span>
        </div>
        <div className={styles.navActions}>
          <Link href="/arbitrage" className={styles.navLink}>
            Funding arb
          </Link>
          <Link href="/" className={styles.navLink}>
            ← Orderbook
          </Link>
          <button
            type="button"
            className={styles.themeBtn}
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? '☀ Light' : '◑ Dark'}
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        <BotsDashboard />
      </main>
    </div>
  );
}
