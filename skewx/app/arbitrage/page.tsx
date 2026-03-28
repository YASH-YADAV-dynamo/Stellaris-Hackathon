'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/store/useAppStore';
import styles from './page.module.css';

const FundingScreener = dynamic(() => import('@/components/FundingScreener'), { ssr: false });

export default function ArbitragePage() {
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
          <span className={styles.navTitle}>Funding rate arbitrage</span>
        </div>
        <div className={styles.navActions}>
          <Link href="/" className={styles.homeLink}>
            ← Orderbook imbalance
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
        <FundingScreener darkMode={darkMode} />
      </main>
    </div>
  );
}
