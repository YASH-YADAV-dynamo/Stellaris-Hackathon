'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  MarketPair,
  searchPairs,
  MAJOR_BASES,
  getAdaptersForPair,
} from '@/lib/pairs';
import { ADAPTERS } from '@/lib/dexAdapters';
import styles from './MarketSelector.module.css';

type Tab = 'all' | 'major' | 'alt';

interface Props {
  pairs:          MarketPair[];
  selected:       string;
  onSelect:       (pairId: string) => void;
  showDexBadges?: boolean;
  className?:     string;
}

export default function MarketSelector({
  pairs,
  selected,
  onSelect,
  showDexBadges = false,
  className,
}: Props) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab]     = useState<Tab>('all');
  const [hlIdx, setHlIdx] = useState(0);
  const wrapRef           = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);

  const activePair = pairs.find(p => p.id === selected);

  // Filter by tab, then by search
  const tabFiltered = tab === 'all'
    ? pairs
    : tab === 'major'
      ? pairs.filter(p => MAJOR_BASES.has(p.base))
      : pairs.filter(p => !MAJOR_BASES.has(p.base));

  const filtered = searchPairs(query, tabFiltered);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setHlIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keyboard nav
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHlIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHlIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[hlIdx]) {
      onSelect(filtered[hlIdx].id);
      setOpen(false);
    }
  }, [filtered, hlIdx, onSelect]);

  // Reset highlight when filter changes
  useEffect(() => { setHlIdx(0); }, [query, tab]);

  return (
    <div ref={wrapRef} className={`${styles.wrap} ${className ?? ''}`}>
      <button className={styles.trigger} onClick={() => setOpen(o => !o)}>
        {activePair?.displayName ?? selected}
        <span className={`${styles.triggerChevron} ${open ? styles.triggerChevronOpen : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <div className={styles.dropdown} onKeyDown={onKeyDown}>
          <div className={styles.search}>
            <input
              ref={inputRef}
              className={styles.searchInput}
              placeholder="Search pairs..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className={styles.tabs}>
            {(['all', 'major', 'alt'] as Tab[]).map(t => (
              <button
                key={t}
                className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'all' ? 'All' : t === 'major' ? 'Major' : 'Alt'}
              </button>
            ))}
          </div>

          <div className={styles.list}>
            {filtered.length === 0 ? (
              <div className={styles.empty}>No pairs found</div>
            ) : (
              filtered.map((pair, i) => {
                const adapterIds = getAdaptersForPair(pair.id);
                return (
                  <button
                    key={pair.id}
                    className={`${styles.item} ${pair.id === selected ? styles.itemActive : ''} ${i === hlIdx ? styles.itemHighlight : ''}`}
                    onClick={() => { onSelect(pair.id); setOpen(false); }}
                    onMouseEnter={() => setHlIdx(i)}
                  >
                    <span className={styles.itemName}>{pair.displayName}</span>
                    <span className={styles.dexStack}>
                      {adapterIds.map((aid, idx) => {
                        const adapter = (ADAPTERS as Record<string, { color: string; name: string }>)[aid];
                        return (
                          <span
                            key={aid}
                            className={styles.dexStackIcon}
                            style={{ zIndex: adapterIds.length - idx }}
                            title={adapter?.name ?? aid}
                          >
                            <Image
                              src={`/exchanges/${aid}.png`}
                              alt={aid}
                              width={20}
                              height={20}
                              className={styles.dexStackImg}
                              unoptimized
                            />
                          </span>
                        );
                      })}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
