'use client';

import styles from './ImbalanceGauge.module.css';

interface ImbalanceGaugeProps {
  imbalance: number; // -1 to +1
  symbol: string;
}

export default function ImbalanceGauge({ imbalance, symbol }: ImbalanceGaugeProps) {
  const pct = Math.abs(imbalance) * 50; // 0–50% fill from center
  const isBid = imbalance >= 0;
  const label = `${imbalance >= 0 ? '+' : ''}${(imbalance * 100).toFixed(1)}%`;
  const side = imbalance > 0.1 ? 'BID PRESSURE' : imbalance < -0.1 ? 'ASK PRESSURE' : 'BALANCED';

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.symbol}>{symbol} · IMBALANCE</span>
        <span className={styles.value} data-side={isBid ? 'bid' : 'ask'}>{label}</span>
        <span className={styles.sideLabel} data-side={isBid ? 'bid' : 'ask'}>{side}</span>
      </div>

      <div className={styles.track}>
        <div className={styles.center} />
        {isBid ? (
          <div
            className={`${styles.fill} ${styles.fillBid}`}
            style={{ width: `${pct}%`, right: '50%' }}
          />
        ) : (
          <div
            className={`${styles.fill} ${styles.fillAsk}`}
            style={{ width: `${pct}%`, left: '50%' }}
          />
        )}
      </div>

      <div className={styles.scale}>
        <span>–100%</span>
        <span>ASK</span>
        <span>0</span>
        <span>BID</span>
        <span>+100%</span>
      </div>
    </div>
  );
}
