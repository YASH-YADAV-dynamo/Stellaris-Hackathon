'use client';

import { FormulaParams, FormulaType } from '@/types/orderbook';
import { getFormulaGuide } from '@/lib/formulaGuide';
import styles from './OrderbookInfoPanel.module.css';

interface OrderbookInfoPanelProps {
  formula: FormulaType;
  params: FormulaParams;
}

export default function OrderbookInfoPanel({ formula, params }: OrderbookInfoPanelProps) {
  const guide = getFormulaGuide(formula, params);

  return (
    <aside className={styles.panel}>
      <div className={styles.card}>
        <p className={styles.kicker}>Orderbook imbalance values</p>
        <h2 className={styles.title}>Range: -1.00 to +1.00</h2>
        <ul className={styles.rangeList}>
          <li><span>+0.20 to +1.00</span><span>Strong bid pressure</span></li>
          <li><span>+0.05 to +0.20</span><span>Mild bid pressure</span></li>
          <li><span>-0.05 to +0.05</span><span>Balanced</span></li>
          <li><span>-0.20 to -0.05</span><span>Mild ask pressure</span></li>
          <li><span>-1.00 to -0.20</span><span>Strong ask pressure</span></li>
        </ul>
      </div>

      <div className={styles.card}>
        <p className={styles.cardTitle}>Current formula: {guide.name}</p>
        <div className={styles.fraction}>
          <p className={styles.fracLabel}>Numerator</p>
          <p className={styles.numerator}>{guide.numerator}</p>
          <div className={styles.fractionBar} />
          <p className={styles.fracLabel}>Denominator</p>
          <p className={styles.denominator}>{guide.denominator}</p>
        </div>
        {guide.note && <p className={styles.note}>{guide.note}</p>}
        {guide.parameterHint && <p className={styles.paramHint}>{guide.parameterHint}</p>}
      </div>
    </aside>
  );
}
