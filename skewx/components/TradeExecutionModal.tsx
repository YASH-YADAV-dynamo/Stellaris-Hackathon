'use client';

import { useEffect, useState } from 'react';
import { placeOrder } from '@/lib/trading/executionClient';
import {
  readApiKey,
  readWalletAddress,
  writeApiKey,
  writeWalletAddress,
} from '@/lib/trading/sessionAgent';
import { toErrorMessage } from '@/lib/trading/wallet';
import type { ExecutionExchange, TradeIntent } from '@/types/trading';
import styles from './TradeExecutionModal.module.css';

const SUPPORTED: Set<ExecutionExchange> = new Set(['hyperliquid', 'hotstuff']);
const SIZE_MIN = 10;
const SIZE_MAX = 5000;
const SIZE_STEP = 10;

const EXCHANGE_META: Record<ExecutionExchange, { name: string; apiKeyUrl: string; hint: string }> = {
  hyperliquid: {
    name: 'Hyperliquid',
    apiKeyUrl: 'https://app.hyperliquid.xyz/API',
    hint: 'Go to app.hyperliquid.xyz/API, connect your main wallet, create an API wallet, and paste its private key here.',
  },
  hotstuff: {
    name: 'HotStuff',
    apiKeyUrl: 'https://app.hotstuff.trade',
    hint: 'Go to app.hotstuff.trade, connect your main wallet, create an API agent wallet, and paste its private key here.',
  },
};

interface TradeExecutionModalProps {
  intent: TradeIntent | null;
  onClose: () => void;
}

export default function TradeExecutionModal({ intent, onClose }: TradeExecutionModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [sizeUsd, setSizeUsd] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!intent || !SUPPORTED.has(intent.exchange)) {
      setApiKey('');
      setWalletAddress('');
      setShowKey(false);
      setSizeUsd('100');
      setError(null);
      setNotice(null);
      setResult(null);
      return;
    }
    const saved = readApiKey(intent.exchange);
    const savedWallet = readWalletAddress(intent.exchange);
    setApiKey(saved ?? '');
    setWalletAddress(savedWallet ?? '');
    setError(null);
    setNotice(saved ? 'API key loaded from session.' : null);
    setResult(null);
  }, [intent]);

  if (!intent || !SUPPORTED.has(intent.exchange)) return null;

  const meta = EXCHANGE_META[intent.exchange];

  async function handlePlace(): Promise<void> {
    if (!apiKey.trim()) {
      setError('Paste your API wallet private key first.');
      return;
    }
    const size = Number(sizeUsd);
    if (!Number.isFinite(size) || size <= 0) {
      setError('Size (USD) must be a positive number.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);

    try {
      const key = apiKey.trim().startsWith('0x') ? apiKey.trim() : `0x${apiKey.trim()}`;
      writeApiKey(intent.exchange, key);
      if (walletAddress.trim()) writeWalletAddress(intent.exchange, walletAddress.trim());

      const res = await placeOrder({
        exchange: intent.exchange,
        symbol: intent.symbol,
        side: intent.side,
        sizeUsd: String(size),
        apiPrivateKey: key,
        walletAddress: walletAddress.trim() || undefined,
      });

      const priceStr = res.fillPrice ? ` @ $${res.fillPrice.toLocaleString()}` : '';
      setResult(`${res.status.toUpperCase()} · ${res.orderId}${priceStr}`);
      if (res.message) setNotice(res.message);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.card}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Trade execution"
      >
        <div className={styles.header}>
          <h3 className={styles.title}>Execute on {meta.name}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className={styles.intent}>
          {intent.symbol} · {intent.side.toUpperCase()}
        </p>

        <p className={styles.hint}>
          {meta.hint}{' '}
          <a href={meta.apiKeyUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
            Open {meta.name} ↗
          </a>
        </p>

        <label className={styles.field}>
          <span>API Wallet Private Key</span>
          <div className={styles.keyRow}>
            <input
              className={styles.input}
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={() => setShowKey(v => !v)}
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        {intent.exchange === 'hyperliquid' && (
          <label className={styles.field}>
            <span>Master Wallet Address (Optional)</span>
            <input
              className={styles.input}
              value={walletAddress}
              onChange={e => setWalletAddress(e.target.value)}
              placeholder="0x... (required for many HL API-agent wallets)"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        <label className={styles.field}>
          <span>Size (USD)</span>
          <div className={styles.sliderRow}>
            <input
              className={styles.slider}
              type="range"
              min={SIZE_MIN}
              max={SIZE_MAX}
              step={SIZE_STEP}
              value={Number(sizeUsd) || 0}
              onChange={e => setSizeUsd(e.target.value)}
            />
            <span className={styles.sliderValue}>${Number(sizeUsd).toLocaleString()}</span>
          </div>
        </label>

        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => { void handlePlace(); }}
          disabled={busy || !apiKey.trim()}
        >
          {busy ? 'Placing Order…' : `${intent.side.toUpperCase()} ${intent.symbol}`}
        </button>

        {notice && <p className={styles.notice}>{notice}</p>}
        {result && <p className={styles.result}>{result}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
