'use client';

import { Level } from '@/types/orderbook';
import styles from './DepthBars.module.css';

const MAX_LEVELS = 10;

interface DepthBarsProps {
  bids: Level[];
  asks: Level[];
}

export default function DepthBars({ bids, asks }: DepthBarsProps) {
  const topBids = bids.slice(0, MAX_LEVELS);
  const topAsks = asks.slice(0, MAX_LEVELS);

  const allVols = [
    ...topBids.map(l => parseFloat(l.a)),
    ...topAsks.map(l => parseFloat(l.a)),
  ];
  const maxVol = allVols.length ? Math.max(...allVols) : 1;

  return (
    <div className={styles.wrapper}>
      {/* Bids */}
      <div className={styles.side}>
        <div className={styles.header}>
          <span className={styles.colLabel} style={{ textAlign: 'right' }}>AMOUNT</span>
          <span className={styles.colLabel} style={{ textAlign: 'right' }}>ORDERS</span>
          <span className={styles.colLabel} style={{ textAlign: 'right', color: 'var(--bid)' }}>BID PRICE</span>
        </div>
        {topBids.map((level, i) => {
          const vol = parseFloat(level.a);
          const pct = (vol / maxVol) * 100;
          return (
            <div key={i} className={styles.row}>
              <div
                className={`${styles.bar} ${styles.barBid}`}
                style={{ width: `${pct}%` }}
              />
              <span className={styles.amount}>{parseFloat(level.a).toFixed(2)}</span>
              <span className={styles.orders}>{level.n > 0 ? level.n : '–'}</span>
              <span className={`${styles.price} ${styles.priceBid}`}>{parseFloat(level.p).toFixed(4)}</span>
            </div>
          );
        })}
      </div>

      {/* Center divider */}
      <div className={styles.centerDivider}>
        <span className={styles.spreadLabel}>DEPTH</span>
      </div>

      {/* Asks */}
      <div className={styles.side}>
        <div className={styles.header}>
          <span className={styles.colLabel} style={{ color: 'var(--ask)' }}>ASK PRICE</span>
          <span className={styles.colLabel}>ORDERS</span>
          <span className={styles.colLabel}>AMOUNT</span>
        </div>
        {topAsks.map((level, i) => {
          const vol = parseFloat(level.a);
          const pct = (vol / maxVol) * 100;
          return (
            <div key={i} className={`${styles.row} ${styles.rowAsk}`}>
              <div
                className={`${styles.bar} ${styles.barAsk}`}
                style={{ width: `${pct}%` }}
              />
              <span className={`${styles.price} ${styles.priceAsk}`}>{parseFloat(level.p).toFixed(4)}</span>
              <span className={styles.orders}>{level.n > 0 ? level.n : '–'}</span>
              <span className={styles.amount}>{parseFloat(level.a).toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
