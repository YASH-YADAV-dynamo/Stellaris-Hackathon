'use client';

import styles from './GlobalFooter.module.css';

export default function GlobalFooter() {
  return (
    <footer className={styles.footer} aria-label="Global footer">
      <div className={styles.inner}>
        <span className={styles.brand}>skewX</span>
        <span className={styles.sep}>•</span>
        <span className={styles.meta}>Orderbook Imbalance & Funding Arbitrage</span>
        <a
          className={styles.link}
          href="https://x.com/yashastro23"
          target="_blank"
          rel="noopener noreferrer"
        >
          @dynamo
        </a>
      </div>
    </footer>
  );
}
