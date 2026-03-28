import { FormulaParams, FormulaType } from '@/types/orderbook';

export interface FormulaGuide {
  name: string;
  numerator: string;
  denominator: string;
  note?: string;
  parameterHint?: string;
}

export function getFormulaGuide(formula: FormulaType, params: FormulaParams): FormulaGuide {
  switch (formula) {
    case 'distanceWeighted':
      return {
        name: 'Distance-Weighted',
        numerator: 'Weighted Bid Volume - Weighted Ask Volume',
        denominator: 'Weighted Bid Volume + Weighted Ask Volume',
        note: `Weight uses exp(-${params.lambda.toFixed(1)} × distance from mid)`,
        parameterHint: `λ = ${params.lambda.toFixed(1)}. Higher λ focuses more on levels closest to mid; lower λ includes farther depth.`,
      };

    case 'nearMid':
      return {
        name: 'Near-Mid Liquidity',
        numerator: `Bid Volume inside ±${params.xPct.toFixed(1)}% band - Ask Volume inside ±${params.xPct.toFixed(1)}% band`,
        denominator: `Bid Volume inside ±${params.xPct.toFixed(1)}% band + Ask Volume inside ±${params.xPct.toFixed(1)}% band`,
        parameterHint: `x% = ${params.xPct.toFixed(1)}%. It means the formula only uses orders within ±${params.xPct.toFixed(1)}% of mid price.`,
      };

    case 'classic':
      return {
        name: 'Classic',
        numerator: 'Total Bid Volume - Total Ask Volume',
        denominator: 'Total Bid Volume + Total Ask Volume',
      };

    case 'ofi':
      return {
        name: 'Order Flow Imbalance',
        numerator: 'Net Bid Size Change - Net Ask Size Change',
        denominator: 'Total Visible Depth',
      };

    case 'microprice':
      return {
        name: 'Microprice',
        numerator: '2 × (Microprice - Mid Price)',
        denominator: 'Spread',
        note: 'Microprice is weighted by top bid/ask sizes.',
      };

    case 'powerLaw':
      return {
        name: 'Power-Law Depth',
        numerator: 'Weighted Bid Volume - Weighted Ask Volume',
        denominator: 'Weighted Bid Volume + Weighted Ask Volume',
        note: `Weight uses 1 / distance^${params.alpha.toFixed(1)}`,
        parameterHint: `α = ${params.alpha.toFixed(1)}. Higher α gives much more weight to near-mid liquidity.`,
      };

    default:
      return {
        name: 'Imbalance',
        numerator: 'Bid Pressure - Ask Pressure',
        denominator: 'Bid Pressure + Ask Pressure',
      };
  }
}
