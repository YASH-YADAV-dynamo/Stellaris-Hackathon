'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSmoothedLeaderboard } from '@/hooks/useSmoothedLeaderboard';
import styles from './Leaderboard.module.css';

export interface LeaderboardEntry {
  id: string;
  name: string;
  route: string;
  color: string;
  symbol: string;
  imbalance: number;
  emaImbalance: number;
  bidVol: number;
  askVol: number;
  spread: number;
  connected: boolean;
  connecting: boolean;
  supported: boolean;
}

const ROW_H = 72;

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

function fv(n: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

function ExchangeIcon({ id, name, color }: { id: string; name: string; color: string }) {
  const [errored, setErrored] = useState(false);

  return (
    <div className={styles.dexCell}>
      <span className={styles.iconWrap}>
        {errored ? (
          <span className={styles.dexDotFallback} style={{ background: color }} />
        ) : (
          <Image
            src={`/exchanges/${id}.png`}
            alt={name}
            width={36}
            height={36}
            className={styles.dexIcon}
            onError={() => setErrored(true)}
            unoptimized
          />
        )}
      </span>
      <span className={styles.dexName}>{name}</span>
    </div>
  );
}

export default function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const visible  = entries.filter(e => e.supported);
  const smoothed = useSmoothedLeaderboard(visible);

  if (visible.length === 0) {
    return <div className={styles.empty}>No DEXes support the selected pair.</div>;
  }

  return (
    <div className={styles.tableScroll}>
      <div className={styles.table}>
        <div className={`${styles.row} ${styles.headRow}`}>
          <div className={styles.col}>#</div>
          <div className={styles.col}>Exchange</div>
          <div className={`${styles.col} ${styles.numCol}`}>Imbalance (Dec)</div>
          <div className={styles.col}>Direction</div>
          <div className={`${styles.col} ${styles.numCol}`}>Bid Vol</div>
          <div className={`${styles.col} ${styles.numCol}`}>Ask Vol</div>
          <div className={styles.col}>Status</div>
          <div className={styles.col} />
        </div>

        <div
          className={styles.body}
          style={{ height: `${visible.length * ROW_H}px` }}
        >
          {smoothed.map(entry => {
            const clampedImb = clampUnit(entry.displayImbalance);
            const isBid  = clampedImb >= 0;
            const absImb = Math.abs(clampedImb);
            const dir    = absImb > 0.05 ? (isBid ? 'Bid pressure' : 'Ask pressure') : 'Balanced';
            const pct    = entry.connected
              ? `${clampedImb >= 0 ? '+' : ''}${clampedImb.toFixed(2)}`
              : '—';
            const statusKey = entry.connected ? 'live' : entry.connecting ? 'wait' : 'off';

            return (
              <div
                key={entry.id}
                className={styles.dataRow}
                style={{ transform: `translateY(${entry.rank * ROW_H}px)` }}
              >
                <div className={`${styles.col} ${styles.rankCol}`}>{entry.rank + 1}</div>

                <div className={`${styles.col} ${styles.dexCol}`}>
                  <ExchangeIcon id={entry.id} name={entry.name} color={entry.color} />
                </div>

                <div
                  className={`${styles.col} ${styles.numCol} ${styles.imbCol}`}
                  data-dir={entry.connected ? (isBid ? 'bid' : 'ask') : 'none'}
                >
                  {pct}
                </div>

                <div
                  className={`${styles.col} ${styles.dirCol}`}
                  data-dir={entry.connected ? (isBid ? 'bid' : 'ask') : 'none'}
                >
                  {entry.connected ? dir : '—'}
                </div>

                <div className={`${styles.col} ${styles.numCol} ${styles.volCol}`}>
                  {entry.connected ? fv(entry.displayBidVol) : '—'}
                </div>

                <div className={`${styles.col} ${styles.numCol} ${styles.volAskCol}`}>
                  {entry.connected ? fv(entry.displayAskVol) : '—'}
                </div>

                <div className={`${styles.col} ${styles.statusCol}`}>
                  <span className={styles.statusDot} data-s={statusKey} />
                  <span className={styles.statusText}>
                    {entry.connected ? 'Live' : entry.connecting ? 'Connecting' : 'Offline'}
                  </span>
                </div>

                <div className={`${styles.col} ${styles.actionCol}`}>
                  <Link href={entry.route} className={styles.openLink}>
                    Open ↗
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
