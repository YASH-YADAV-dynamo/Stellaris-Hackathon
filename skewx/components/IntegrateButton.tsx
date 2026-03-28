'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './IntegrateButton.module.css';

export type SignalType = 'noise-reduction' | 'raw';

const MCP_CONFIG_PLACEHOLDER = '<path-to-this-project>';

function getMCPConfig(signalType: SignalType): string {
  const signalArg = signalType === 'noise-reduction' ? 'noise-reduction' : 'raw';
  return JSON.stringify(
    {
      mcpServers: {
        'orderbook-signals': {
          command: 'npx',
          args: ['tsx', 'mcp-server/index.ts', '--signal-type', signalArg],
          cwd: MCP_CONFIG_PLACEHOLDER,
        },
      },
    },
    null,
    2,
  );
}

const TOOLTIP_TEXT =
  'Connect to Cursor or other MCP clients. Get trading signals, leaderboard, and arbitrage opportunities. Choose Noise reduction (5-stage filtered) or Raw (unfiltered). Replace the cwd path in the config with your project path.';

export default function IntegrateButton() {
  const [open, setOpen] = useState(false);
  const [signalType, setSignalType] = useState<SignalType>('noise-reduction');
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowTooltip(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const handleCopy = async () => {
    const config = getMCPConfig(signalType);
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      setCopied(false);
    }
  };

  return (
    <div
      className={styles.wrap}
      ref={dropdownRef}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.triggerIcon}>⎘</span>
        Integrate
      </button>

      {showTooltip && !open && (
        <div className={styles.tooltip} role="tooltip">
          {TOOLTIP_TEXT}
        </div>
      )}

      {open && (
        <div className={styles.dropdown} role="listbox">
          <p className={styles.dropdownDesc}>{TOOLTIP_TEXT}</p>
          <div className={styles.dropdownLabel}>Signal type</div>
          <button
            type="button"
            role="option"
            aria-selected={signalType === 'noise-reduction'}
            className={`${styles.option} ${signalType === 'noise-reduction' ? styles.optionActive : ''}`}
            onClick={() => setSignalType('noise-reduction')}
          >
            <span className={styles.optionCheck}>{signalType === 'noise-reduction' ? '✓' : ''}</span>
            Noise reduction
          </button>
          <button
            type="button"
            role="option"
            aria-selected={signalType === 'raw'}
            className={`${styles.option} ${signalType === 'raw' ? styles.optionActive : ''}`}
            onClick={() => setSignalType('raw')}
          >
            <span className={styles.optionCheck}>{signalType === 'raw' ? '✓' : ''}</span>
            Raw
          </button>
          <button
            type="button"
            className={styles.copyBtn}
            onClick={handleCopy}
          >
            <span className={styles.copyIcon}>{copied ? '✓' : '⎘'}</span>
            {copied ? 'Copied!' : 'Copy MCP config'}
          </button>
        </div>
      )}
    </div>
  );
}
