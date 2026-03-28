interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isPhantom?: boolean;
  providers?: Eip1193Provider[];
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/**
 * Returns true when the thrown value is a user cancellation (EIP-1193 code 4001
 * or MetaMask "User denied" message).  These should be shown as a soft notice,
 * not a red error banner.
 */
export function isUserRejection(e: unknown): boolean {
  if (e == null || typeof e !== 'object') return false;
  const obj = e as Record<string, unknown>;
  if (obj.code === 4001) return true;
  if (typeof obj.message === 'string' && /user (denied|rejected)/i.test(obj.message)) return true;
  return false;
}

/**
 * Extracts a human-readable string from any thrown value.
 *
 * Handles all wallet/provider error shapes:
 *   - Error instances                           → .message
 *   - EIP-1193 provider errors                  → .message  (code 4001 = user rejected, etc.)
 *   - ethers.js errors                          → .reason | .shortMessage | .message
 *   - { error: string }                         → .error
 *   - Plain strings                             → as-is
 *   - Anything else                             → JSON or "Unknown error"
 */
export function toErrorMessage(e: unknown): string {
  if (typeof e === 'string') return e || 'Unknown error';
  if (e == null) return 'Unknown error';

  if (typeof e === 'object') {
    const obj = e as Record<string, unknown>;

    // ethers.js error shapes
    if (typeof obj.shortMessage === 'string' && obj.shortMessage) return obj.shortMessage;
    if (typeof obj.reason === 'string' && obj.reason) return obj.reason;

    // Standard .message (Error instances, EIP-1193, fetch errors…)
    if (typeof obj.message === 'string' && obj.message) return obj.message;

    // Nested { error: string } from some providers
    if (typeof obj.error === 'string' && obj.error) return obj.error;
    if (typeof obj.error === 'object' && obj.error !== null) {
      const inner = obj.error as Record<string, unknown>;
      if (typeof inner.message === 'string' && inner.message) return inner.message;
    }

    // Last resort — try JSON so we see the structure
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }

  return 'Unknown error';
}

export function hasEvmWallet(): boolean {
  return typeof window !== 'undefined' && getInjectedProviders().length > 0;
}

/** Checks code for EIP-1193 "method not supported" variants. */
function isMethodNotSupported(e: unknown): boolean {
  if (e == null || typeof e !== 'object') return false;
  const { code } = e as Record<string, unknown>;
  // -32601 = method not found, 4200 = unsupported method
  return code === -32601 || code === 4200;
}

export type SupportedWalletId = 'metamask' | 'rabby' | 'phantom' | 'injected';

export interface WalletOption {
  id: SupportedWalletId;
  label: string;
  installed: boolean;
  installUrl: string;
}

const WALLET_META: Record<SupportedWalletId, { label: string; installUrl: string }> = {
  metamask: {
    label: 'MetaMask',
    installUrl: 'https://metamask.io/download/',
  },
  rabby: {
    label: 'Rabby',
    installUrl: 'https://rabby.io/',
  },
  phantom: {
    label: 'Phantom',
    installUrl: 'https://phantom.com/download',
  },
  injected: {
    label: 'Injected Wallet',
    installUrl: 'https://metamask.io/download/',
  },
};

let activeProvider: Eip1193Provider | null = null;

function getInjectedProviders(): Eip1193Provider[] {
  if (typeof window === 'undefined' || !window.ethereum) return [];
  const root = window.ethereum;
  const list = Array.isArray(root.providers) && root.providers.length > 0
    ? root.providers
    : [root];
  return list.filter(Boolean);
}

function classifyProvider(provider: Eip1193Provider): SupportedWalletId {
  if (provider.isRabby) return 'rabby';
  if (provider.isPhantom) return 'phantom';
  if (provider.isMetaMask) return 'metamask';
  return 'injected';
}

function pickProvider(preferred?: SupportedWalletId): Eip1193Provider | null {
  const providers = getInjectedProviders();
  if (providers.length === 0) return null;
  if (!preferred) return providers[0];
  return providers.find(p => classifyProvider(p) === preferred) ?? null;
}

function getProviderOrThrow(preferred?: SupportedWalletId): Eip1193Provider {
  const provider = pickProvider(preferred) ?? activeProvider ?? pickProvider();
  if (!provider) {
    const target = preferred ? WALLET_META[preferred].label : 'an EVM wallet';
    throw new Error(`No ${target} wallet detected. Install extension and refresh.`);
  }
  return provider;
}

export function getWalletOptions(): WalletOption[] {
  const providers = getInjectedProviders();
  const installedSet = new Set<SupportedWalletId>();
  for (const p of providers) installedSet.add(classifyProvider(p));
  if (providers.length > 0) installedSet.add('injected');
  return (Object.keys(WALLET_META) as SupportedWalletId[]).map(id => ({
    id,
    label: WALLET_META[id].label,
    installUrl: WALLET_META[id].installUrl,
    installed: installedSet.has(id),
  }));
}

/**
 * Reads accounts silently — no popup, no side effects.
 * Returns [] when not connected or MetaMask is locked.
 */
async function getConnectedAccounts(): Promise<string[]> {
  if (typeof window === 'undefined') return [];
  const provider = activeProvider ?? pickProvider();
  if (!provider) return [];
  try {
    const result = await provider.request({ method: 'eth_accounts' });
    const list = result as unknown[];
    return Array.isArray(list)
      ? (list.filter(a => typeof a === 'string' && (a as string).startsWith('0x')) as string[])
      : [];
  } catch {
    return [];
  }
}

/**
 * Connects the user's EVM wallet and returns the selected address.
 *
 * Uses `wallet_requestPermissions` as the primary method because it
 * ALWAYS opens the MetaMask UI (account picker / unlock screen), unlike
 * `eth_requestAccounts` which can silently throw 4001 when MetaMask is
 * locked, the site is in a blocked state, or a popup was previously missed.
 *
 * Falls back to `eth_requestAccounts` only for wallets that do not implement
 * `wallet_requestPermissions` (code -32601 or 4200).
 */
export async function connectEvmWallet(preferred?: SupportedWalletId): Promise<string> {
  const provider = getProviderOrThrow(preferred);
  activeProvider = provider;

  // Fast path: wallet already unlocked and site already connected — no popup needed.
  const preConnected = await getConnectedAccounts();
  if (preConnected.length > 0) return preConnected[0];

  // wallet_requestPermissions always opens MetaMask UI (account picker or unlock screen).
  try {
    await provider.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch (e) {
    if (isMethodNotSupported(e)) {
      // Wallet doesn't support wallet_requestPermissions → fall back.
      await provider.request({ method: 'eth_requestAccounts' });
    } else {
      throw e;
    }
  }

  // Read the selected account after the permission dialog closes.
  const accounts = await getConnectedAccounts();
  if (accounts.length === 0) {
    throw new Error('No accounts available after approving wallet connection.');
  }
  return accounts[0];
}

export async function signWithEoa(walletAddress: string, message: string): Promise<string> {
  const provider = getProviderOrThrow();
  const result = await provider.request({
    method: 'personal_sign',
    params: [message, walletAddress],
  });
  if (typeof result !== 'string' || !result) {
    throw new Error('Wallet returned an empty or invalid signature.');
  }
  return result;
}
