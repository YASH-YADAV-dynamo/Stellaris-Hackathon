// ── Auth ────────────────────────────────────────────────────────────────────

export interface DxdNonceRequest { address: string }
export interface DxdNonceResponse { nonce: string; message: string }
export interface DxdLoginRequest { address: string; signature: string }
export interface DxdLoginResponse { token: string; user_id: string; wallet_address: string }

// ── Sessions ─────────────────────────────────────────────────────────────────

export type DxdSessionStatus = 'starting' | 'running' | 'stopped' | 'error';
export type DxdStrategy = 'maker' | 'taker';

export interface DxdSession {
  session_id: string;
  status: DxdSessionStatus;
  strategy: DxdStrategy;
  symbols: string[];
  agent_address: string;
  started_at: string;
  stopped_at: string | null;
  error: string | null;
}

export interface DxdSessionsResponse {
  sessions: DxdSession[];
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface DxdMakerConfig {
  min_spread_bps?: number;
  levels?: number;
  level_spacing_bps?: number;
  order_size_usd?: number;
  target_exposure_x?: number;
  use_alpha?: boolean;
  fixed_tp_enabled?: boolean;
  fixed_tp_bps?: number;
  market_bias?: number;
  leverage?: number;
  max_loss_pct?: number;
  guard_max_session_loss_usd?: number;
  [key: string]: unknown;
}

export interface DxdTakerConfig {
  min_spread_usd?: number;
  min_spread_bps?: number;
  take_profit_bps?: number;
  close_bps?: number;
  close_timeout_ms?: number;
  order_size_usd?: number;
  target_exposure_x?: number;
  leverage?: number;
  cooldown_s?: number;
  max_loss_usd?: number;
  order_expiry_ms?: number;
  market_bias?: number;
}

export interface DxdConfigDefaults {
  defaults: Record<string, DxdMakerConfig>;
  allowed_keys: string[];
  taker_defaults: DxdTakerConfig;
  taker_defaults_by_symbol: Record<string, DxdTakerConfig>;
  taker_allowed_keys: string[];
}

// ── Start Session ─────────────────────────────────────────────────────────────

export interface DxdStartMakerRequest {
  strategy: 'maker';
  agent_address: string;
  agent_private_key: string;
  symbols: string[];
  config?: DxdMakerConfig;
  symbol_config?: Record<string, DxdMakerConfig>;
}

export interface DxdStartTakerRequest {
  strategy: 'taker';
  agent_address: string;
  agent_private_key: string;
  symbols: [string];
  taker_config?: DxdTakerConfig;
}

export type DxdStartRequest = DxdStartMakerRequest | DxdStartTakerRequest;

export interface DxdStartResponse extends DxdSession {
  config?: Record<string, DxdMakerConfig>;
  taker_config?: DxdTakerConfig;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface DxdMetricsSnapshot {
  ts: string;
  pnl: number;
  pnl_realized: number;
  pnl_unrealized: number;
  inventory: number;
  inv_tier: number;
  total_fills: number;
  total_volume_usd: number;
  round_trips: number;
  spread_bps: number;
  quote_mode: string;
  vol_bps: number;
  alpha: number;
  toxic: number;
  adverse_rate: number;
  avg_markout_1s: number;
  avg_markout_5s: number;
  guard_interventions: number;
  guard_halted: boolean;
  guard_spread_mult: number;
  account_equity: number;
  fair_mid: number;
  hs_mid: number;
  bn_mid: number;
}

export interface DxdMetricsResponse {
  session_id: string;
  metrics: Record<string, DxdMetricsSnapshot>;
}
