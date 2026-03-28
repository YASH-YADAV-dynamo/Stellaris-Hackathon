/**
 * 5-stage noise reduction pipeline for orderbook imbalance signals.
 * Pure functions, usable in browser and Node.
 */

import type { Regime, TradingSignal, NoiseReductionState } from '@/types/orderbook';

const DEFAULT_SPIKE_THRESHOLD = 0.3;
const DEFAULT_SPIKE_WINDOW = 5;
const DEFAULT_EMA_HALFLIFE_MS = 1000;
const DEFAULT_ROBUST_WINDOW = 15;
const MAX_HISTORY = 50;

// ── Stage 1: Spike filter ───────────────────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function applySpikeFilter(
  value: number,
  history: number[],
  threshold = DEFAULT_SPIKE_THRESHOLD,
  windowSize = DEFAULT_SPIKE_WINDOW,
): { filtered: number; spikeDetected: boolean } {
  const prev = history[history.length - 1];
  if (prev === undefined) return { filtered: value, spikeDetected: false };

  const delta = Math.abs(value - prev);
  if (delta <= threshold) return { filtered: value, spikeDetected: false };

  const window = history.slice(-windowSize);
  const filtered = median(window.length >= 2 ? window : [prev, value]);
  return { filtered, spikeDetected: true };
}

// ── Stage 2: EMA ─────────────────────────────────────────────────────────────

export function applyEMA(
  value: number,
  prevEma: number,
  dtMs: number,
  halfLifeMs = DEFAULT_EMA_HALFLIFE_MS,
): number {
  const alpha = 1 - Math.exp(-dtMs / halfLifeMs);
  return alpha * value + (1 - alpha) * prevEma;
}

// ── Stage 3: Kalman filter ───────────────────────────────────────────────────

export interface KalmanState {
  x: number;
  P: number;
}

export function applyKalman(
  measurement: number,
  prev: KalmanState | null,
  processNoise = 0.01,
  measNoise = 0.1,
): KalmanState {
  const P = prev ? prev.P + processNoise : 1;
  const K = P / (P + measNoise);
  const x = prev ? prev.x + K * (measurement - prev.x) : measurement;
  const PNew = (1 - K) * P;
  return { x, P: PNew };
}

// ── Stage 4: Robust mean ──────────────────────────────────────────────────────

export function robustMean(history: number[], windowSize = DEFAULT_ROBUST_WINDOW): number {
  const window = history.slice(-windowSize);
  if (window.length === 0) return 0;
  return median(window);
}

// ── Stage 5: Regime detection ─────────────────────────────────────────────────

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function detectRegime(history: number[], windowSize = 20): Regime {
  const window = history.slice(-windowSize);
  if (window.length < 5) return 'stable';

  const sigma = stdDev(window);
  if (sigma < 0.02) return 'stable';
  if (sigma < 0.08) return 'trending';
  return 'volatile';
}

export function regimeConfidence(regime: Regime): number {
  switch (regime) {
    case 'stable': return 1;
    case 'trending': return 0.8;
    case 'volatile': return 0.5;
    default: return 0.5;
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export interface NoiseReductionOptions {
  spikeThreshold?: number;
  spikeWindow?: number;
  emaHalfLifeMs?: number;
  robustWindow?: number;
}

export function createNoiseState(): NoiseReductionState {
  return {
    history: [],
    smoothedHistory: [],
    lastValue: 0,
    ema: 0,
    kalmanState: null,
    spikeCount: 0,
  };
}

export function computeTradingSignal(
  rawImbalance: number,
  state: NoiseReductionState,
  now: number,
  lastT: number,
  opts: NoiseReductionOptions = {},
): TradingSignal {
  const {
    spikeThreshold = DEFAULT_SPIKE_THRESHOLD,
    spikeWindow = DEFAULT_SPIKE_WINDOW,
    emaHalfLifeMs = DEFAULT_EMA_HALFLIFE_MS,
    robustWindow = DEFAULT_ROBUST_WINDOW,
  } = opts;

  const dt = lastT ? now - lastT : emaHalfLifeMs;

  // Stage 1: Spike filter
  const { filtered: spikeFiltered, spikeDetected } = applySpikeFilter(
    rawImbalance,
    state.history,
    spikeThreshold,
    spikeWindow,
  );
  if (spikeDetected) state.spikeCount += 1;

  // Stage 2: EMA
  const ema = applyEMA(spikeFiltered, state.ema, dt, emaHalfLifeMs);
  state.ema = ema;

  // Stage 3: Kalman
  state.kalmanState = applyKalman(ema, state.kalmanState);
  const kalmanValue = state.kalmanState.x;
  const uncertainty = Math.sqrt(state.kalmanState.P);

  // Stage 4: Robust mean (over smoothed/kalman history)
  state.smoothedHistory = [...state.smoothedHistory, kalmanValue].slice(-MAX_HISTORY);
  const robust = robustMean(state.smoothedHistory, robustWindow);

  // Stage 5: Regime (from smoothed history)
  const regime = detectRegime(state.smoothedHistory, 20);
  const confidence = regimeConfidence(regime);

  // Update raw history (for spike filter)
  state.history = [...state.history, rawImbalance].slice(-MAX_HISTORY);
  state.lastValue = rawImbalance;

  return {
    value: robust,
    confidence,
    regime,
    rawImbalance,
    emaImbalance: ema,
    spikeFiltered: spikeDetected,
    uncertainty,
  };
}
