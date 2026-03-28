'use client';

import { useCallback, useEffect, useState } from 'react';
import { ADAPTERS } from '@/lib/dexAdapters';
import type { AdapterId } from '@/lib/dexAdapters';
import { FUNDING_ADAPTER_ORDER } from '@/lib/funding/buildMatrix';
import { FUNDING_RATE_DEADBAND } from '@/lib/funding/constants';
import { MARKET_PAIRS } from '@/lib/pairs';
import type { FundingApiResponse, FundingCellResult } from '@/types/funding';
import type { TradeIntent } from '@/types/trading';
import TradeExecutionModal from '@/components/TradeExecutionModal';
import styles from './FundingScreener.module.css';

const DEX_ICON = 36;

const REFRESH_MS = 45_000;
const ARBITRAGE_SYMBOLS = MARKET_PAIRS.map(p => p.id);

function shouldRenderDash(cell: FundingCellResult): boolean {
  if (cell.status !== 'error') return false;
  const msg = cell.message.toLowerCase();
  return (
    cell.code === 'unsupported_pair' ||
    msg.includes('pair not listed on this venue') ||
    msg.includes('symbol not in markets') ||
    msg.includes('market not listed')
  );
}

function fmtCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  const hh = Math.floor(mm / 60);
  const m = mm % 60;
  if (hh > 0) return `${hh}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function rateSign(rate: number): 'pos' | 'neg' | 'zero' {
  if (rate > FUNDING_RATE_DEADBAND) return 'pos';
  if (rate < -FUNDING_RATE_DEADBAND) return 'neg';
  return 'zero';
}

function FundingCell({
  adapterId,
  symbol,
  cell,
  nowMs,
  onSignalClick,
}: {
  adapterId: AdapterId;
  symbol: string;
  cell: FundingCellResult;
  nowMs: number;
  onSignalClick: (intent: TradeIntent) => void;
}) {
  if (cell.status === 'error') {
    if (shouldRenderDash(cell)) {
      return (
        <div className={styles.cellInner}>
          <span className={styles.dash}>—</span>
        </div>
      );
    }
    return (
      <div className={styles.cellInner}>
        <span className={styles.err} title={`[${cell.code}] ${cell.message}`}>
          ERR
        </span>
      </div>
    );
  }

  const { data } = cell;
  const rem = data.nextFundingMs - nowMs;
  const tag = data.tag;
  const actionableExchange = (adapterId === 'hyperliquid' || adapterId === 'hotstuff')
    ? adapterId
    : null;

  const signalButton = tag === 'buy' || tag === 'sell'
    ? (
      <button
        type="button"
        className={`${styles.pill} ${tag === 'buy' ? styles.pillBuy : styles.pillSell} ${actionableExchange ? styles.pillAction : ''}`}
        disabled={!actionableExchange}
        title={actionableExchange ? `Send ${tag.toUpperCase()} intent for ${symbol} on ${ADAPTERS[actionableExchange].name}` : 'Execution not enabled for this venue yet'}
        onClick={() => {
          if (!actionableExchange) return;
          onSignalClick({
            exchange: actionableExchange,
            symbol,
            side: tag,
          });
        }}
      >
        {tag.toUpperCase()}
      </button>
    )
    : null;

  return (
    <div
      className={styles.cellInner}
      data-tag={tag === 'neutral' ? undefined : tag}
    >
      <span
        className={styles.rate}
        data-sign={rateSign(data.fundingRateHourly)}
        title={data.dataSource}
      >
        {data.paymentDisplay}
      </span>
      <span className={styles.cd} title="Time until next funding settlement">
        {fmtCountdown(rem)}
      </span>
      {signalButton}
    </div>
  );
}

interface FundingScreenerProps {
  darkMode?: boolean;
}

export default function FundingScreener({ darkMode: _darkMode = true }: FundingScreenerProps) {
  void _darkMode;
  const [data, setData] = useState<FundingApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [tradeIntent, setTradeIntent] = useState<TradeIntent | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        symbols: ARBITRAGE_SYMBOLS.join(','),
      });
      const res = await fetch(`/api/funding?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      const json = (await res.json()) as FundingApiResponse;
      setData(json);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <div className={styles.loading}>LOADING FUNDING MATRIX…</div>;
  }

  if (loadError && !data) {
    return (
      <div className={styles.wrap}>
        <div className={styles.banner}>{loadError}</div>
        <button type="button" className={styles.retry} onClick={() => { setLoading(true); void load(); }}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={styles.wrap}>
      {loadError && data && (
        <div className={styles.banner} title={loadError}>
          Refresh failed (showing last good data). {loadError}
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.title}>FUNDING RATE ARBITRAGE SCREENER</span>
          <span className={styles.subtitle}>
            Funding values from each venue’s API (rate, not USD notional). Hover a cell for endpoint + field.
          </span>
        </div>
        <span className={styles.updated}>
          Updated {new Date(data.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      <div className={styles.tableOuter}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={`${styles.th} ${styles.thSticky}`}>SYMBOL</th>
              <th className={`${styles.th} ${styles.thSticky2}`} title="Max − min funding rate across venues with data">
                MAX SPREAD
              </th>
              {FUNDING_ADAPTER_ORDER.map(id => {
                const a = ADAPTERS[id];
                return (
                  <th key={id} className={`${styles.th} ${styles.dexHead}`}>
                    <div className={styles.dexHeadInner}>
                      <span className={styles.iconWrap}>
                        <img
                          src={`/exchanges/${a.id}.png`}
                          alt=""
                          width={DEX_ICON}
                          height={DEX_ICON}
                          onError={e => {
                            (e.target as HTMLImageElement).style.opacity = '0';
                          }}
                        />
                      </span>
                      <span className={styles.dexName}>{a.name}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.pairs.map(row => (
              <tr key={row.symbol} className={styles.tr}>
                <td className={`${styles.td} ${styles.tdSticky}`}>
                  <span className={styles.sym}>{row.symbol}</span>
                </td>
                <td className={`${styles.td} ${styles.tdSticky2} ${styles.maxArb}`}>
                  {row.maxArbRate != null ? (
                    `${(row.maxArbRate * 100).toFixed(4)}%`
                  ) : (
                    <span className={styles.maxArbEmpty}>—</span>
                  )}
                </td>
                {FUNDING_ADAPTER_ORDER.map(id => (
                  <td key={id} className={`${styles.td} ${styles.cell}`}>
                    <FundingCell
                      adapterId={id}
                      symbol={row.symbol}
                      cell={row.cells[id]}
                      nowMs={nowMs}
                      onSignalClick={setTradeIntent}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TradeExecutionModal
        intent={tradeIntent}
        onClose={() => setTradeIntent(null)}
      />
    </div>
  );
}
