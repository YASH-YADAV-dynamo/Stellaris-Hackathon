'use client';

import { useEffect, useRef } from 'react';
import styles from './StatsRow.module.css';

interface StatCardProps {
  label: string;
  value: string;
  accent?: 'bid' | 'ask' | 'neutral';
}

function StatCard({ label, value, accent = 'neutral' }: StatCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value && ref.current) {
      ref.current.classList.remove(styles.flash);
      void ref.current.offsetWidth; // reflow
      ref.current.classList.add(styles.flash);
      prevValue.current = value;
    }
  }, [value]);

  return (
    <div className={styles.card} ref={ref}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value} data-accent={accent}>{value}</span>
    </div>
  );
}

interface StatsRowProps {
  totalBidVol: number;
  totalAskVol: number;
  spread: number;
  imbalance: number;
  numBidLevels: number;
  numAskLevels: number;
  timestamp: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

export default function StatsRow({
  totalBidVol, totalAskVol, spread, imbalance,
  numBidLevels, numAskLevels, timestamp,
}: StatsRowProps) {
  const latency = timestamp ? `${Date.now() - timestamp}ms` : '--';

  return (
    <div className={styles.row}>
      <StatCard label="BID VOLUME" value={fmt(totalBidVol)} accent="bid" />
      <StatCard label="ASK VOLUME" value={fmt(totalAskVol)} accent="ask" />
      <StatCard label="SPREAD" value={spread > 0 ? spread.toFixed(4) : '--'} />
      <StatCard
        label="IMBALANCE"
        value={`${imbalance >= 0 ? '+' : ''}${(imbalance * 100).toFixed(1)}%`}
        accent={imbalance > 0 ? 'bid' : imbalance < 0 ? 'ask' : 'neutral'}
      />
      <StatCard label="BID LEVELS" value={String(numBidLevels)} accent="bid" />
      <StatCard label="ASK LEVELS" value={String(numAskLevels)} accent="ask" />
      <StatCard label="LATENCY" value={latency} />
    </div>
  );
}
