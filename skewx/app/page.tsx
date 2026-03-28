'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { FORMULA_META, FormulaType } from '@/types/orderbook';
import { useDexOrderbook } from '@/hooks/useDexOrderbook';
import { useBinancePrice } from '@/hooks/useBinancePrice';
import { useAppStore } from '@/store/useAppStore';
import { ADAPTERS } from '@/lib/dexAdapters';
import { getAllPairs } from '@/lib/pairs';
import { LeaderboardEntry } from '@/components/Leaderboard';
import OrderbookInfoPanel from '@/components/OrderbookInfoPanel';
import dynamic from 'next/dynamic';
import styles from './page.module.css';

const Leaderboard    = dynamic(() => import('@/components/Leaderboard'),    { ssr: false });
const MarketSelector = dynamic(() => import('@/components/MarketSelector'), { ssr: false });

const FORMULA_NAMES: FormulaType[] = [
  'distanceWeighted', 'nearMid', 'classic', 'ofi', 'microprice', 'powerLaw',
];

const ALL_PAIRS = getAllPairs();

export default function LandingPage() {
  const darkMode       = useAppStore(s => s.darkMode);
  const toggleDarkMode = useAppStore(s => s.toggleDarkMode);
  const symbol         = useAppStore(s => s.leaderboardSymbol);
  const formula        = useAppStore(s => s.leaderboardFormula);
  const params         = useAppStore(s => s.leaderboardParams);
  const setSymbol      = useAppStore(s => s.setLeaderboardSymbol);
  const setFormula     = useAppStore(s => s.setLeaderboardFormula);
  const setParams      = useAppStore(s => s.setLeaderboardParams);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const refMid = useBinancePrice(symbol);

  const pacifica    = useDexOrderbook(ADAPTERS.pacifica,     symbol, formula, params, undefined, refMid);
  const zo          = useDexOrderbook(ADAPTERS['01'],       symbol, formula, params, undefined, refMid);
  const hotstuff    = useDexOrderbook(ADAPTERS.hotstuff,    symbol, formula, params, undefined, refMid);
  const paradex     = useDexOrderbook(ADAPTERS.paradex,     symbol, formula, params, undefined, refMid);
  const hibachi     = useDexOrderbook(ADAPTERS.hibachi,     symbol, formula, params, undefined, refMid);
  const hyperliquid = useDexOrderbook(ADAPTERS.hyperliquid, symbol, formula, params, undefined, refMid);
  const extended    = useDexOrderbook(ADAPTERS.extended,    symbol, formula, params, undefined, refMid);
  const aster       = useDexOrderbook(ADAPTERS.aster,       symbol, formula, params, undefined, refMid);
  const orderly     = useDexOrderbook(ADAPTERS.orderly,     symbol, formula, params, undefined, refMid);
  const lighter     = useDexOrderbook(ADAPTERS.lighter,     symbol, formula, params, undefined, refMid);
  const edgex       = useDexOrderbook(ADAPTERS.edgex,       symbol, formula, params, undefined, refMid);
  const dydx        = useDexOrderbook(ADAPTERS.dydx,        symbol, formula, params, undefined, refMid);
  const synthetix   = useDexOrderbook(ADAPTERS.synthetix,   symbol, formula, params, undefined, refMid);

  const hookByAdapter = {
    pacifica, '01': zo, hotstuff, paradex, hibachi, hyperliquid, extended, aster, orderly, lighter, edgex, dydx, synthetix,
  } as const;

  const entries: LeaderboardEntry[] = useMemo(() =>
    (Object.entries(ADAPTERS) as [keyof typeof ADAPTERS, (typeof ADAPTERS)[keyof typeof ADAPTERS]][])
      .map(([id, adapter]) => {
        const { state } = hookByAdapter[id];
        const wsSymbol  = adapter.toWsSymbol(symbol);
        return {
          id:            adapter.id,
          name:          adapter.name,
          route:         adapter.route,
          color:         adapter.color,
          symbol,
          imbalance:     state.imbalance,
          emaImbalance:  state.emaImbalance,
          bidVol:        state.totalBidVol,
          askVol:        state.totalAskVol,
          spread:        state.bids[0] && state.asks[0]
                           ? parseFloat(state.asks[0].p) - parseFloat(state.bids[0].p)
                           : 0,
          connected:     state.connected,
          connecting:    state.connecting,
          supported:     !!wsSymbol,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      symbol,
      pacifica.state, zo.state, hotstuff.state, paradex.state, hibachi.state, hyperliquid.state, extended.state, aster.state, orderly.state, lighter.state, edgex.state, dydx.state, synthetix.state,
    ],
  );

  const meta      = FORMULA_META[formula];
  const hasLambda = formula === 'distanceWeighted';
  const hasXPct   = formula === 'nearMid';
  const hasAlpha  = formula === 'powerLaw';
  const anyLive   = entries.some(e => e.connected);

  return (
    <div className={styles.page}>

      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          <span className={styles.navDot} />
          <span className={styles.navTitle}>Orderbook Imbalance</span>
        </div>
        <div className={styles.navActions}>
          <Link href="/arbitrage" className={styles.navArbLink}>
            Funding arbitrage
          </Link>
          <button type="button" className={styles.themeBtn} onClick={toggleDarkMode}>
            {darkMode ? '☀ Light' : '◑ Dark'}
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.contentGrid}>
          <OrderbookInfoPanel formula={formula} params={params} />

          <div className={styles.widgetOuter}>

            <div className={styles.widgetTitleBar}>
              <div className={styles.widgetTitleLeft}>
                <span className={styles.widgetName}>Live Comparison</span>
                <span className={styles.widgetHint}>
                  ranked by strongest directional pressure
                </span>
              </div>
              <div className={styles.widgetTitleRight}>
                <div className={styles.widgetLive} data-live={anyLive}>
                  <span className={styles.liveDot} />
                  <span className={styles.liveText}>{anyLive ? 'Live' : 'Connecting'}</span>
                </div>
              </div>
            </div>

            <div className={styles.widgetControls}>
              <div className={styles.ctrlGroup}>
                <span className={styles.ctrlLabel}>Market</span>
                <MarketSelector
                  pairs={ALL_PAIRS}
                  selected={symbol}
                  onSelect={setSymbol}
                  showDexBadges
                />
              </div>

              <span className={styles.ctrlDivider} />

              <div className={styles.ctrlGroup}>
                <span className={styles.ctrlLabel}>Formula</span>
                <select
                  className={styles.ctrlSelect}
                  value={formula}
                  onChange={e => setFormula(e.target.value as FormulaType)}
                >
                  {FORMULA_NAMES.map((f, i) => (
                    <option key={f} value={f}>{i + 1}. {FORMULA_META[f].label}</option>
                  ))}
                </select>
              </div>

              {hasLambda && (
                <div className={styles.ctrlGroup}>
                  <span className={styles.ctrlLabel}>Decay λ</span>
                  <input
                    type="range" min={0.1} max={100} step={0.1}
                    value={params.lambda}
                    onChange={e => setParams({ lambda: parseFloat(e.target.value) })}
                    className={styles.ctrlSlider}
                  />
                  <span className={styles.ctrlSliderVal}>{params.lambda.toFixed(1)}</span>
                </div>
              )}
              {hasXPct && (
                <div className={styles.ctrlGroup}>
                  <span className={styles.ctrlLabel}>Band x%</span>
                  <input
                    type="range" min={0.1} max={5} step={0.1}
                    value={params.xPct}
                    onChange={e => setParams({ xPct: parseFloat(e.target.value) })}
                    className={styles.ctrlSlider}
                  />
                  <span className={styles.ctrlSliderVal}>{params.xPct.toFixed(1)}%</span>
                </div>
              )}
              {hasAlpha && (
                <div className={styles.ctrlGroup}>
                  <span className={styles.ctrlLabel}>Exponent α</span>
                  <input
                    type="range" min={0.5} max={3} step={0.1}
                    value={params.alpha}
                    onChange={e => setParams({ alpha: parseFloat(e.target.value) })}
                    className={styles.ctrlSlider}
                  />
                  <span className={styles.ctrlSliderVal}>{params.alpha.toFixed(1)}</span>
                </div>
              )}

              <span className={styles.ctrlDivider} />

              <span className={styles.ctrlFormulaDesc}>
                <span className={styles.ctrlFormulaBadge}>{meta.short}</span>
                {meta.description}
              </span>
            </div>

            <Leaderboard entries={entries} />

          </div>
        </div>
      </main>
    </div>
  );
}
