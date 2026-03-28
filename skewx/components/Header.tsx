'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AggLevel } from '@/types/orderbook';
import { MarketPair } from '@/lib/pairs';
import MarketSelector from '@/components/MarketSelector';
import styles from './Header.module.css';

const AGG_LEVELS: AggLevel[] = [1, 10, 100, 1000, 10000];

interface HeaderProps {
  symbol: string;
  aggLevel: AggLevel;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  darkMode: boolean;
  onSymbolChange: (s: string) => void;
  onAggChange: (a: AggLevel) => void;
  onReconnect: () => void;
  onToggleTheme: () => void;
  brandName?: string;
  brandMetric?: string;
  pairs?: MarketPair[];
  showAgg?: boolean;
  backHref?: string;
}

export default function Header({
  symbol, aggLevel, connected, connecting, error,
  darkMode, onSymbolChange, onAggChange, onReconnect, onToggleTheme,
  brandName = 'PACIFICA',
  brandMetric = 'ORDERBOOK IMBALANCE',
  pairs,
  showAgg = true,
  backHref,
}: HeaderProps) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const statusLabel = connecting ? 'CONNECTING' : connected ? 'LIVE' : error ? 'ERROR' : 'OFFLINE';
  const statusClass = connecting ? styles.connecting : connected ? styles.live : styles.offline;

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        {backHref && (
          <Link href={backHref} className={styles.backBtn} title="Back to Home">
            ←
          </Link>
        )}
        <span className={styles.brandName}>{brandName}</span>
        <span className={styles.divider}>/</span>
        <span className={styles.metric}>{brandMetric}</span>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.label}>MARKET</label>
          {pairs ? (
            <MarketSelector
              pairs={pairs}
              selected={symbol}
              onSelect={onSymbolChange}
            />
          ) : (
            <span className={styles.select}>{symbol}</span>
          )}
        </div>

        {showAgg && (
          <div className={styles.controlGroup}>
            <label className={styles.label}>AGG</label>
            <select
              className={styles.select}
              value={aggLevel}
              onChange={e => onAggChange(Number(e.target.value) as AggLevel)}
            >
              {AGG_LEVELS.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        )}

        <button className={styles.reconnectBtn} onClick={onReconnect} title="Reconnect">
          ↺
        </button>

        <button
          className={styles.themeToggle}
          onClick={onToggleTheme}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? '☀ LIGHT' : '◑ DARK'}
        </button>
      </div>

      <div className={styles.statusGroup}>
        <span className={`${styles.statusDot} ${statusClass}`} />
        <span className={`${styles.statusLabel} ${statusClass}`}>{statusLabel}</span>
        <span className={styles.clock}>{clock}</span>
      </div>
    </header>
  );
}
