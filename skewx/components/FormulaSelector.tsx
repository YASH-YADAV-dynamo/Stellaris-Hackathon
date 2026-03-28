'use client';

import { FormulaParams, FormulaType, FORMULA_META } from '@/types/orderbook';
import styles from './FormulaSelector.module.css';

const FORMULA_ORDER: FormulaType[] = [
  'distanceWeighted',
  'nearMid',
  'classic',
  'ofi',
  'microprice',
  'powerLaw',
];

interface FormulaSelectorProps {
  formula: FormulaType;
  params: FormulaParams;
  onFormulaChange: (f: FormulaType) => void;
  onParamsChange: (p: Partial<FormulaParams>) => void;
}

export default function FormulaSelector({
  formula,
  params,
  onFormulaChange,
  onParamsChange,
}: FormulaSelectorProps) {
  const meta = FORMULA_META[formula];

  return (
    <div className={styles.wrapper}>
      <div className={styles.sectionTitle}>FORMULA</div>

      <select
        className={styles.select}
        value={formula}
        onChange={e => onFormulaChange(e.target.value as FormulaType)}
      >
        {FORMULA_ORDER.map((f, i) => (
          <option key={f} value={f}>
            [{i + 1}] {FORMULA_META[f].label}
          </option>
        ))}
      </select>

      {/* Lambda slider — distanceWeighted */}
      {formula === 'distanceWeighted' && (
        <div className={styles.paramGroup}>
          <label className={styles.paramLabel}>Decay Rate (λ)</label>
          <div className={styles.paramRow}>
            <input
              type="range"
              className={styles.slider}
              min={0.1}
              max={100}
              step={0.1}
              value={params.lambda}
              onChange={e => onParamsChange({ lambda: parseFloat(e.target.value) })}
            />
            <span className={styles.paramValue}>{params.lambda.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* xPct slider — nearMid */}
      {formula === 'nearMid' && (
        <div className={styles.paramGroup}>
          <label className={styles.paramLabel}>Band Width (x%)</label>
          <div className={styles.paramRow}>
            <input
              type="range"
              className={styles.slider}
              min={0.1}
              max={5}
              step={0.1}
              value={params.xPct}
              onChange={e => onParamsChange({ xPct: parseFloat(e.target.value) })}
            />
            <span className={styles.paramValue}>{params.xPct.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Alpha slider — powerLaw */}
      {formula === 'powerLaw' && (
        <div className={styles.paramGroup}>
          <label className={styles.paramLabel}>Exponent (α)</label>
          <div className={styles.paramRow}>
            <input
              type="range"
              className={styles.slider}
              min={0.5}
              max={3}
              step={0.1}
              value={params.alpha}
              onChange={e => onParamsChange({ alpha: parseFloat(e.target.value) })}
            />
            <span className={styles.paramValue}>{params.alpha.toFixed(1)}</span>
          </div>
        </div>
      )}

      <div className={styles.descBox}>
        <span className={styles.badge}>{meta.short}</span>
        <span className={styles.descText}>{meta.description}</span>
      </div>
    </div>
  );
}
