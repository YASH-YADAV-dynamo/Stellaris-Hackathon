'use client';

import { useState } from 'react';
import { DEFAULT_FORMULA_PARAMS, FormulaParams, FormulaType } from '@/types/orderbook';
import { useDexOrderbook } from '@/hooks/useDexOrderbook';
import { useBinancePrice } from '@/hooks/useBinancePrice';
import DashboardLayout from '@/components/DashboardLayout';
import { ADAPTERS } from '@/lib/dexAdapters';
import { getPairsForAdapter } from '@/lib/pairs';
import { useAppStore } from '@/store/useAppStore';

const PAIRS = getPairsForAdapter('dydx');

export default function DydxDashboard() {
  const darkMode       = useAppStore(s => s.darkMode);
  const toggleDarkMode = useAppStore(s => s.toggleDarkMode);

  const [symbol,  setSymbol]  = useState('BTC/USD');
  const [formula, setFormula] = useState<FormulaType>('distanceWeighted');
  const [params,  setParams]  = useState<FormulaParams>(DEFAULT_FORMULA_PARAMS);

  const refMid = useBinancePrice(symbol);

  const { state, history, reconnect } = useDexOrderbook(
    ADAPTERS.dydx, symbol, formula, params, undefined, refMid,
  );

  return (
    <DashboardLayout
      brandName="dYdX"
      supportedPairs={PAIRS}
      backHref="/"
      state={state} history={history} reconnect={reconnect}
      symbol={symbol} onSymbolChange={setSymbol}
      formula={formula} params={params}
      onFormulaChange={setFormula}
      onParamsChange={p => setParams(prev => ({ ...prev, ...p }))}
      darkMode={darkMode} onToggleTheme={toggleDarkMode}
    />
  );
}
