export type ExecutionExchange = 'hyperliquid' | 'hotstuff';
export type ExecutionSide = 'buy' | 'sell';

export interface TradeIntent {
  exchange: ExecutionExchange;
  symbol: string;
  side: ExecutionSide;
}

export interface PlaceOrderRequest {
  exchange: ExecutionExchange;
  symbol: string;
  side: ExecutionSide;
  /** USD notional, e.g. "100" */
  sizeUsd: string;
  /** 0x-prefixed API wallet private key from the exchange */
  apiPrivateKey: string;
  /**
   * Optional master wallet address.
   * For Hyperliquid API-agent wallets this is often required by the SDK.
   */
  walletAddress?: string;
}

export interface PlaceOrderResponse {
  orderId: string;
  status: 'filled' | 'accepted' | 'rejected';
  fillPrice?: number;
  message?: string;
}
