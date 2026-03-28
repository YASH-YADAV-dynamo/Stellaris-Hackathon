'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  AggLevel,
  FormulaParams,
  FormulaType,
  HistoryPoint,
  OrderbookState,
} from '@/types/orderbook';
import type { MarketPair } from '@/lib/pairs';
import Header         from '@/components/Header';
import FormulaSelector from '@/components/FormulaSelector';
import ImbalanceGauge  from '@/components/ImbalanceGauge';
import StatsRow        from '@/components/StatsRow';
import DepthBars       from '@/components/DepthBars';
import styles from './DashboardLayout.module.css';

const ImbalanceChart = dynamic(() => import('@/components/ImbalanceChart'), { ssr: false });
const VolumeChart    = dynamic(() => import('@/components/VolumeChart'),    { ssr: false });

interface DashboardLayoutProps {
  brandName:        string;
  brandMetric?:     string;
  supportedPairs:   MarketPair[];
  showAgg?:         boolean;
  backHref?:        string;

  state:     OrderbookState;
  history:   HistoryPoint[];
  reconnect: () => void;

  symbol:         string;
  onSymbolChange: (s: string) => void;

  formula:         FormulaType;
  params:          FormulaParams;
  onFormulaChange: (f: FormulaType) => void;
  onParamsChange:  (patch: Partial<FormulaParams>) => void;

  /** Only used by Pacifica */
  aggLevel?:   AggLevel;
  onAggChange?: (a: AggLevel) => void;

  darkMode:      boolean;
  onToggleTheme: () => void;
}

export default function DashboardLayout({
  brandName,
  brandMetric = 'ORDERBOOK IMBALANCE · MAINNET',
  supportedPairs,
  showAgg = false,
  backHref,
  state, history, reconnect,
  symbol, onSymbolChange,
  formula, params, onFormulaChange, onParamsChange,
  aggLevel = 1, onAggChange,
  darkMode, onToggleTheme,
}: DashboardLayoutProps) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <div className={styles.shell}>
      <Header
        symbol={symbol}
        aggLevel={aggLevel}
        connected={state.connected}
        connecting={state.connecting}
        error={state.error}
        darkMode={darkMode}
        onSymbolChange={onSymbolChange}
        onAggChange={onAggChange ?? (() => {})}
        onReconnect={reconnect}
        onToggleTheme={onToggleTheme}
        brandName={brandName}
        brandMetric={brandMetric}
        pairs={supportedPairs}
        showAgg={showAgg}
        backHref={backHref}
      />

      <main className={styles.main}>
        <div className={styles.bentoGrid}>

          <div className={`${styles.card} ${styles.formulaCard}`}>
            <FormulaSelector
              formula={formula}
              params={params}
              onFormulaChange={onFormulaChange}
              onParamsChange={onParamsChange}
            />
          </div>

          <div className={`${styles.card} ${styles.gaugeCard}`}>
            <ImbalanceGauge
              imbalance={state.imbalance}
              symbol={`${symbol} · ${brandName}`}
            />
          </div>

          <div className={`${styles.card} ${styles.statsCard}`}>
            <StatsRow
              totalBidVol={state.totalBidVol}
              totalAskVol={state.totalAskVol}
              spread={state.spread}
              imbalance={state.imbalance}
              numBidLevels={state.bids.length}
              numAskLevels={state.asks.length}
              timestamp={state.timestamp}
            />
          </div>

          <div className={`${styles.card} ${styles.depthCard}`}>
            <DepthBars bids={state.bids} asks={state.asks} />
          </div>

          <div className={`${styles.card} ${styles.imbalanceChartCard}`}>
            <ImbalanceChart history={history} darkMode={darkMode} />
          </div>

          <div className={`${styles.card} ${styles.volumeChartCard}`}>
            <VolumeChart history={history} darkMode={darkMode} />
          </div>

        </div>
      </main>

      {state.error && (
        <div className={styles.errorBar}>
          <span className={styles.errorDot} />
          {state.error}
        </div>
      )}
    </div>
  );
}
