'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectEvmWallet,
  getWalletOptions,
  signWithEoa,
  toErrorMessage,
  type SupportedWalletId,
  type WalletOption,
} from '@/lib/trading/wallet';
import type {
  DxdConfigDefaults,
  DxdMetricsResponse,
  DxdMetricsSnapshot,
  DxdSession,
  DxdSessionStatus,
  DxdStartRequest,
  DxdStrategy,
} from '@/lib/dxd/types';
import styles from './BotsDashboard.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_HOST = 'http://localhost:8199';
const AVAILABLE_SYMBOLS = ['BTC-PERP', 'ETH-PERP'];
const POLL_INTERVAL_MS = 6_000;

const SESSION_KEY = 'dxd:jwt';
const HOST_KEY = 'dxd:host';
const WALLET_KEY = 'dxd:wallet';

// ── DXD fetch helper ──────────────────────────────────────────────────────────

async function dxdFetch(
  host: string,
  path: string,
  options: RequestInit & { jwt?: string } = {},
): Promise<Response> {
  const { jwt, ...rest } = options;
  const headers = new Headers(rest.headers ?? {});
  headers.set('x-dxd-host', host);
  headers.set('content-type', 'application/json');
  if (jwt) headers.set('authorization', `Bearer ${jwt}`);

  return fetch(`/api/dxd/${path}`, { ...rest, headers });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPnl(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtNum(n: number, dp = 2): string {
  return n.toFixed(dp);
}

function fmtVol(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function timeSince(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const STATUS_LABEL: Record<DxdSessionStatus, string> = {
  starting: 'STARTING',
  running: 'RUNNING',
  stopped: 'STOPPED',
  error: 'ERROR',
};

const INV_TIER_LABEL = ['Normal', 'Skew', 'Skip-open', 'Close-only'];

// ── MetricsCell ───────────────────────────────────────────────────────────────

function MetricsCell({ symbol, snap }: { symbol: string; snap: DxdMetricsSnapshot }) {
  const pnlPositive = snap.pnl >= 0;
  return (
    <div className={styles.metricCell}>
      <div className={styles.metricCellHeader}>
        <span className={styles.metricSymbol}>{symbol}</span>
        {snap.guard_halted && <span className={styles.guardBadge}>HALTED</span>}
        <span className={styles.quoteMode}>{snap.quote_mode}</span>
      </div>

      <div className={styles.pnlRow}>
        <span className={pnlPositive ? styles.pnlPos : styles.pnlNeg}>
          {fmtPnl(snap.pnl)}
        </span>
        <span className={styles.pnlSub}>
          R {fmtPnl(snap.pnl_realized)} · U {fmtPnl(snap.pnl_unrealized)}
        </span>
      </div>

      <div className={styles.metricGrid}>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Equity</span>
          <span className={styles.metricValue}>${fmtNum(snap.account_equity)}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Inventory</span>
          <span className={styles.metricValue}>
            {fmtNum(snap.inventory, 4)}
            <span className={styles.invTier}>{INV_TIER_LABEL[snap.inv_tier] ?? snap.inv_tier}</span>
          </span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Spread</span>
          <span className={styles.metricValue}>{fmtNum(snap.spread_bps, 1)} bps</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Vol</span>
          <span className={styles.metricValue}>{fmtNum(snap.vol_bps, 1)} bps</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Fills</span>
          <span className={styles.metricValue}>{snap.total_fills}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Volume</span>
          <span className={styles.metricValue}>{fmtVol(snap.total_volume_usd)}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Round trips</span>
          <span className={styles.metricValue}>{snap.round_trips}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Alpha</span>
          <span className={styles.metricValue}>{fmtNum(snap.alpha, 3)}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Toxic</span>
          <span className={styles.metricValue}>{fmtNum(snap.toxic, 2)}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Mark 1s</span>
          <span className={styles.metricValue}>{fmtNum(snap.avg_markout_1s, 3)}</span>
        </div>
      </div>

      <div className={styles.midRow}>
        <span>HS {fmtNum(snap.hs_mid, 2)}</span>
        <span>Fair {fmtNum(snap.fair_mid, 2)}</span>
        <span>BN {fmtNum(snap.bn_mid, 2)}</span>
      </div>
    </div>
  );
}

// ── SessionCard ───────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: DxdSession;
  metrics: DxdMetricsResponse | undefined;
  warmup: boolean;
  onStop: (id: string) => void;
  stoppingId: string | null;
}

function SessionCard({ session, metrics, warmup, onStop, stoppingId }: SessionCardProps) {
  const isRunning = session.status === 'running';
  const isStopping = stoppingId === session.session_id;
  const shortId = session.session_id.slice(0, 10);

  const totalPnl = metrics
    ? Object.values(metrics.metrics).reduce((s, m) => s + m.pnl, 0)
    : null;
  const totalEquity = metrics
    ? Object.values(metrics.metrics).reduce((s, m) => s + m.account_equity, 0)
    : null;

  return (
    <div className={`${styles.sessionCard} ${styles[`status_${session.status}`]}`}>
      <div className={styles.sessionHeader}>
        <div className={styles.sessionMeta}>
          <span className={`${styles.statusDot} ${styles[`dot_${session.status}`]}`} />
          <span className={styles.sessionId}>{shortId}…</span>
          <span className={`${styles.strategyBadge} ${styles[`strat_${session.strategy}`]}`}>
            {session.strategy.toUpperCase()}
          </span>
          <span className={`${styles.statusBadge} ${styles[`sb_${session.status}`]}`}>
            {STATUS_LABEL[session.status]}
          </span>
        </div>
        <div className={styles.sessionActions}>
          {totalEquity !== null && (
            <span className={styles.equitySummary}>${fmtNum(totalEquity)} equity</span>
          )}
          {totalPnl !== null && (
            <span className={totalPnl >= 0 ? styles.pnlPos : styles.pnlNeg}>
              {fmtPnl(totalPnl)}
            </span>
          )}
          {isRunning && (
            <button
              type="button"
              className={styles.stopBtn}
              onClick={() => onStop(session.session_id)}
              disabled={isStopping}
            >
              {isStopping ? 'Stopping…' : '■ Stop'}
            </button>
          )}
        </div>
      </div>

      <div className={styles.sessionInfo}>
        <span className={styles.sessionAge}>{timeSince(session.started_at)}</span>
        <div className={styles.symbolPills}>
          {session.symbols.map(s => (
            <span key={s} className={styles.symbolPill}>{s}</span>
          ))}
        </div>
      </div>

      {session.error && (
        <p className={styles.sessionError}>{session.error}</p>
      )}

      {isRunning && warmup && !metrics && (
        <div className={styles.warmup}>
          <span className={styles.warmupDot} />
          Warming up — metrics arrive in 10–30 s
        </div>
      )}

      {metrics && (
        <div className={styles.metricsRow}>
          {session.symbols.map(sym => {
            const snap = metrics.metrics[sym];
            if (!snap) return null;
            return <MetricsCell key={sym} symbol={sym} snap={snap} />;
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function BotsDashboard() {
  // ── Persisted state ─────────────────────────────────────────────────────────
  const [host, setHost] = useState(DEFAULT_HOST);
  const [jwt, setJwt] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<SupportedWalletId>('metamask');

  // ── Session state ───────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<DxdSession[]>([]);
  const [metrics, setMetrics] = useState<Record<string, DxdMetricsResponse>>({});
  const [warmupSet, setWarmupSet] = useState<Set<string>>(new Set());
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [strategy, setStrategy] = useState<DxdStrategy>('maker');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['BTC-PERP', 'ETH-PERP']);
  const [agentAddress, setAgentAddress] = useState('');
  const [agentKey, setAgentKey] = useState('');
  const [showAgentKey, setShowAgentKey] = useState(false);
  const [spreadBps, setSpreadBps] = useState('2.0');
  const [levels, setLevels] = useState('3');
  const [marketBias, setMarketBias] = useState('0.0');
  const [defaults, setDefaults] = useState<DxdConfigDefaults | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [authBusy, setAuthBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startNotice, setStartNotice] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load from sessionStorage ─────────────────────────────────────────────────
  useEffect(() => {
    const savedHost = sessionStorage.getItem(HOST_KEY);
    const savedJwt = sessionStorage.getItem(SESSION_KEY);
    const savedWallet = sessionStorage.getItem(WALLET_KEY);
    if (savedHost) setHost(savedHost);
    if (savedJwt) setJwt(savedJwt);
    if (savedWallet) setWalletAddress(savedWallet);
  }, []);

  useEffect(() => {
    const options = getWalletOptions();
    setWalletOptions(options);
    const preferred = options.find(o => o.installed && o.id !== 'injected') ?? options.find(o => o.installed);
    if (preferred) setSelectedWallet(preferred.id);
  }, []);

  // ── Load config defaults ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!host) return;
    dxdFetch(host, 'config/defaults')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setDefaults(data as DxdConfigDefaults); })
      .catch(() => null);
  }, [host]);

  // ── Load sessions when authenticated ─────────────────────────────────────────
  const refreshSessions = useCallback(async (currentJwt: string, currentHost: string) => {
    try {
      const res = await dxdFetch(currentHost, 'sessions', { jwt: currentJwt });
      if (res.status === 401) { setJwt(null); sessionStorage.removeItem(SESSION_KEY); return; }
      if (!res.ok) return;
      const data = await res.json() as { sessions: DxdSession[] };
      setSessions(data.sessions ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (jwt) void refreshSessions(jwt, host);
  }, [jwt, host, refreshSessions]);

  // ── Metrics polling ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    const runningSessions = sessions.filter(s => s.status === 'running' || s.status === 'starting');
    if (runningSessions.length === 0 || !jwt) return;

    const poll = async () => {
      for (const session of runningSessions) {
        try {
          const res = await dxdFetch(host, `sessions/${session.session_id}/metrics`, { jwt });
          if (res.status === 404) {
            setWarmupSet(prev => new Set(prev).add(session.session_id));
          } else if (res.ok) {
            const data = await res.json() as DxdMetricsResponse;
            setMetrics(prev => ({ ...prev, [session.session_id]: data }));
            setWarmupSet(prev => { const n = new Set(prev); n.delete(session.session_id); return n; });
          }
        } catch { /* ignore */ }
      }
      // Also refresh session list to detect status changes
      if (jwt) void refreshSessions(jwt, host);
    };

    void poll();
    pollRef.current = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessions, jwt, host, refreshSessions]);

  // ── Auth ──────────────────────────────────────────────────────────────────────
  async function handleLogin() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const selected = walletOptions.find(w => w.id === selectedWallet);
      if (selected && !selected.installed) {
        window.open(selected.installUrl, '_blank', 'noopener,noreferrer');
        throw new Error(`${selected.label} extension not found. Install it and try again.`);
      }

      const address = await connectEvmWallet(selectedWallet);

      const nonceRes = await dxdFetch(host, 'auth/nonce', {
        method: 'POST',
        body: JSON.stringify({ address }),
      });
      if (!nonceRes.ok) {
        const err = await nonceRes.json() as { detail?: string };
        throw new Error(err.detail ?? `Nonce request failed (${nonceRes.status})`);
      }
      const { message } = await nonceRes.json() as { message: string };

      // Sign the message with the main wallet (EIP-191 personal_sign)
      const sig = await signWithEoa(address, message);

      const loginRes = await dxdFetch(host, 'auth/login', {
        method: 'POST',
        body: JSON.stringify({ address, signature: sig }),
      });
      if (!loginRes.ok) {
        const err = await loginRes.json() as { detail?: string };
        throw new Error(err.detail ?? `Login failed (${loginRes.status})`);
      }
      const { token } = await loginRes.json() as { token: string };

      sessionStorage.setItem(SESSION_KEY, token);
      sessionStorage.setItem(HOST_KEY, host);
      sessionStorage.setItem(WALLET_KEY, address);
      setJwt(token);
      setWalletAddress(address);
    } catch (e) {
      setAuthError(toErrorMessage(e));
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    setJwt(null);
    setWalletAddress(null);
    setSessions([]);
    setMetrics({});
  }

  // ── Start Session ─────────────────────────────────────────────────────────────
  async function handleStart() {
    if (!jwt) return;
    if (!agentAddress.trim() || !agentKey.trim()) {
      setStartError('Agent address and private key are required.');
      return;
    }
    const syms = strategy === 'taker' ? selectedSymbols.slice(0, 1) : selectedSymbols;
    if (syms.length === 0) { setStartError('Select at least one symbol.'); return; }

    setStartBusy(true);
    setStartError(null);
    setStartNotice(null);

    const key = agentKey.trim().startsWith('0x') ? agentKey.trim() : `0x${agentKey.trim()}`;

    const body: DxdStartRequest = strategy === 'maker'
      ? {
          strategy: 'maker',
          agent_address: agentAddress.trim(),
          agent_private_key: key,
          symbols: syms,
          config: {
            min_spread_bps: parseFloat(spreadBps) || 2.0,
            levels: parseInt(levels) || 3,
            market_bias: parseFloat(marketBias) || 0.0,
          },
        }
      : {
          strategy: 'taker',
          agent_address: agentAddress.trim(),
          agent_private_key: key,
          symbols: [syms[0]],
          taker_config: {
            min_spread_bps: parseFloat(spreadBps) || 0.1,
            market_bias: parseFloat(marketBias) || 0.0,
          },
        };

    try {
      const res = await dxdFetch(host, 'sessions', {
        method: 'POST',
        body: JSON.stringify(body),
        jwt,
      });
      const data = await res.json() as { detail?: string; session_id?: string };
      if (!res.ok) throw new Error(data.detail ?? `Start failed (${res.status})`);

      setStartNotice(`Session ${data.session_id?.slice(0, 8)}… started.`);
      void refreshSessions(jwt, host);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setStartBusy(false);
    }
  }

  // ── Stop Session ──────────────────────────────────────────────────────────────
  async function handleStop(sessionId: string) {
    if (!jwt) return;
    setStoppingId(sessionId);
    try {
      await dxdFetch(host, `sessions/${sessionId}/stop`, { method: 'POST', jwt });
      void refreshSessions(jwt, host);
    } catch { /* ignore */ }
    finally { setStoppingId(null); }
  }

  // ── Symbol toggle ─────────────────────────────────────────────────────────────
  function toggleSymbol(sym: string) {
    if (strategy === 'taker') { setSelectedSymbols([sym]); return; }
    setSelectedSymbols(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym],
    );
  }

  const runningSessions = sessions.filter(
    s => s.status === 'running' || s.status === 'starting',
  );
  const historicSessions = sessions.filter(
    s => s.status === 'stopped' || s.status === 'error',
  );

  const isLoggedIn = !!jwt;

  // ── Taker defaults ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!defaults) return;
    if (strategy === 'taker') {
      const sym = selectedSymbols[0];
      const td = sym
        ? (defaults.taker_defaults_by_symbol[sym] ?? defaults.taker_defaults)
        : defaults.taker_defaults;
      setSpreadBps(String(td.min_spread_bps ?? 0.1));
    } else {
      const sym = selectedSymbols[0];
      const md = sym ? defaults.defaults[sym] : null;
      setSpreadBps(String(md?.min_spread_bps ?? 2.0));
      setLevels(String(md?.levels ?? 3));
    }
  }, [strategy, selectedSymbols, defaults]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>

        {/* Auth panel */}
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Connection</p>

          <label className={styles.field}>
            <span>DXD Host</span>
            <input
              className={styles.input}
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="http://localhost:8199"
              spellCheck={false}
            />
          </label>

          {!isLoggedIn ? (
            <>
              <div className={styles.walletRow}>
                {walletOptions.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`${styles.walletBtn} ${selectedWallet === opt.id ? styles.walletBtnActive : ''}`}
                    onClick={() => setSelectedWallet(opt.id)}
                  >
                    {opt.label}
                    {!opt.installed && <span className={styles.walletMissing}>Install</span>}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => { void handleLogin(); }}
                disabled={authBusy || !host}
              >
                {authBusy ? 'Connecting…' : 'Connect Wallet & Sign In'}
              </button>
              {authError && <p className={styles.errMsg}>{authError}</p>}
              <p className={styles.hint}>
                Signs with your main HotStuff wallet via EIP-191. No password needed.
              </p>
            </>
          ) : (
            <div className={styles.authStatus}>
              <span className={styles.authDot} />
              <span className={styles.authAddr}>{walletAddress?.slice(0, 8)}…{walletAddress?.slice(-4)}</span>
              <button type="button" className={styles.ghostBtn} onClick={handleLogout}>
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Start session panel */}
        {isLoggedIn && (
          <div className={styles.panel}>
            <p className={styles.panelTitle}>New Bot</p>

            {/* Strategy tabs */}
            <div className={styles.tabs}>
              {(['maker', 'taker'] as DxdStrategy[]).map(s => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.tab} ${strategy === s ? styles.tabActive : ''}`}
                  onClick={() => setStrategy(s)}
                >
                  {s === 'maker' ? 'Maker MM' : 'Taker'}
                </button>
              ))}
            </div>

            {/* Symbols */}
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {strategy === 'taker' ? 'Symbol (pick one)' : 'Symbols'}
              </span>
              <div className={styles.symbolCheckboxes}>
                {AVAILABLE_SYMBOLS.map(sym => (
                  <button
                    key={sym}
                    type="button"
                    className={`${styles.symBtn} ${selectedSymbols.includes(sym) ? styles.symBtnActive : ''}`}
                    onClick={() => toggleSymbol(sym)}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent address */}
            <label className={styles.field}>
              <span>Agent Address</span>
              <input
                className={styles.input}
                value={agentAddress}
                onChange={e => setAgentAddress(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
            </label>

            {/* Agent key */}
            <label className={styles.field}>
              <span>Agent Private Key</span>
              <div className={styles.keyRow}>
                <input
                  className={styles.input}
                  type={showAgentKey ? 'text' : 'password'}
                  value={agentKey}
                  onChange={e => setAgentKey(e.target.value)}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className={styles.toggleBtn}
                  onClick={() => setShowAgentKey(v => !v)}
                >
                  {showAgentKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {/* Config */}
            <div className={styles.configRow}>
              <label className={styles.field}>
                <span>Spread (bps)</span>
                <input
                  className={styles.input}
                  value={spreadBps}
                  onChange={e => setSpreadBps(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              {strategy === 'maker' && (
                <label className={styles.field}>
                  <span>Levels</span>
                  <input
                    className={styles.input}
                    value={levels}
                    onChange={e => setLevels(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
              )}
              <label className={styles.field}>
                <span>Bias</span>
                <input
                  className={styles.input}
                  value={marketBias}
                  onChange={e => setMarketBias(e.target.value)}
                  inputMode="decimal"
                  title="-1 = full short, 0 = neutral, 1 = full long"
                />
              </label>
            </div>

            <button
              type="button"
              className={styles.startBtn}
              onClick={() => { void handleStart(); }}
              disabled={startBusy || !agentAddress.trim() || !agentKey.trim() || selectedSymbols.length === 0}
            >
              {startBusy ? 'Starting…' : `▶ Start ${strategy === 'maker' ? 'Maker' : 'Taker'}`}
            </button>

            {startError && <p className={styles.errMsg}>{startError}</p>}
            {startNotice && <p className={styles.noticeMsg}>{startNotice}</p>}

            <p className={styles.hint}>
              Key is sent once to your DXD instance and encrypted at rest — never returned.
            </p>
          </div>
        )}
      </aside>

      {/* ── Sessions main area ───────────────────────────────────────────────── */}
      <div className={styles.sessionsArea}>
        {!isLoggedIn && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>⬡</span>
            <p className={styles.emptyTitle}>Connect to DXD</p>
            <p className={styles.emptySubtitle}>
              Enter your DXD API host and sign in with your HotStuff wallet to start bots.
            </p>
          </div>
        )}

        {isLoggedIn && runningSessions.length === 0 && historicSessions.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>◎</span>
            <p className={styles.emptyTitle}>No sessions yet</p>
            <p className={styles.emptySubtitle}>
              Configure a bot in the panel on the left and click Start.
            </p>
          </div>
        )}

        {runningSessions.length > 0 && (
          <div className={styles.sectionGroup}>
            <p className={styles.sectionLabel}>Active · {runningSessions.length}</p>
            {runningSessions.map(s => (
              <SessionCard
                key={s.session_id}
                session={s}
                metrics={metrics[s.session_id]}
                warmup={warmupSet.has(s.session_id)}
                onStop={id => { void handleStop(id); }}
                stoppingId={stoppingId}
              />
            ))}
          </div>
        )}

        {historicSessions.length > 0 && (
          <div className={styles.sectionGroup}>
            <p className={styles.sectionLabel}>History · {historicSessions.length}</p>
            {historicSessions.map(s => (
              <SessionCard
                key={s.session_id}
                session={s}
                metrics={metrics[s.session_id]}
                warmup={false}
                onStop={id => { void handleStop(id); }}
                stoppingId={stoppingId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
