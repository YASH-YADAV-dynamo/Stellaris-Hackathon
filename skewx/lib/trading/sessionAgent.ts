import type { ExecutionExchange } from '@/types/trading';

const KEY_PREFIX = 'trade:apikey';
const WALLET_PREFIX = 'trade:wallet';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function storageKey(exchange: ExecutionExchange): string {
  return `${KEY_PREFIX}:${exchange}`;
}

function walletStorageKey(exchange: ExecutionExchange): string {
  return `${WALLET_PREFIX}:${exchange}`;
}

/** Read the saved API private key for an exchange from sessionStorage. */
export function readApiKey(exchange: ExecutionExchange): string | null {
  if (!canUseStorage()) return null;
  return window.sessionStorage.getItem(storageKey(exchange));
}

/** Persist the API private key for an exchange in sessionStorage. */
export function writeApiKey(exchange: ExecutionExchange, key: string): void {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(storageKey(exchange), key);
}

/** Remove the saved API key for an exchange (e.g. on explicit logout). */
export function clearApiKey(exchange: ExecutionExchange): void {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(storageKey(exchange));
}

/** Read the saved wallet address for an exchange from sessionStorage. */
export function readWalletAddress(exchange: ExecutionExchange): string | null {
  if (!canUseStorage()) return null;
  return window.sessionStorage.getItem(walletStorageKey(exchange));
}

/** Persist wallet address for an exchange in sessionStorage. */
export function writeWalletAddress(exchange: ExecutionExchange, walletAddress: string): void {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(walletStorageKey(exchange), walletAddress);
}
