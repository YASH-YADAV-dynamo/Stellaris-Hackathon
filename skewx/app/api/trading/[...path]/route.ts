import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function jsonOk(data: unknown): Response {
  return Response.json(data);
}

function jsonError(message: string, status = 500): Response {
  return Response.json({ error: message }, { status });
}

async function readBody<T>(req: NextRequest): Promise<T> {
  return req.json() as Promise<T>;
}

/** Ensure the private key has the 0x prefix viem and the HL SDK expect. */
function normalizeKey(raw: string): `0x${string}` {
  const k = raw.trim();
  return (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`;
}

/** "BTC/USD" → "BTC" */
function baseFromSymbol(symbol: string): string {
  return symbol.split('/')[0];
}

// ─── Hyperliquid ──────────────────────────────────────────────────────────────

interface HlStatus {
  filled?: { oid: number; totalSz: string; avgPx: string };
  resting?: { oid: number };
  error?: string;
}

async function placeHyperliquidOrder(params: {
  symbol: string;
  side: 'buy' | 'sell';
  sizeUsd: number;
  apiPrivateKey: `0x${string}`;
  walletAddress?: string;
}): Promise<Response> {
  // Dynamic import keeps the SDK out of the browser bundle
  const { Hyperliquid } = await import('hyperliquid');

  const base = baseFromSymbol(params.symbol);

  const sdk = new Hyperliquid({
    privateKey: params.apiPrivateKey,
    enableWs: false,
    testnet: false,
    walletAddress: params.walletAddress,
  });

  // Current mid prices
  const allMids = (await sdk.info.getAllMids()) as Record<string, string>;
  const price = parseFloat(allMids[base] ?? '0');
  if (!price) throw new Error(`No price available for ${base} on Hyperliquid`);

  // Size in base asset, rounded to 4 dp (HL minimum tick is typically 0.0001)
  const rawSize = params.sizeUsd / price;
  const size = Math.max(Math.round(rawSize * 10_000) / 10_000, 0.0001);

  // marketOpen places an IOC limit at mid ± slippage — simplest market order API
  const raw = await sdk.exchange.marketOpen(
    base,
    params.side === 'buy',
    size,
    undefined, // auto-price
    0.01,      // 1 % slippage tolerance
  );

  const result = raw as { status?: string; response?: { data?: { statuses?: HlStatus[] } } };
  const statuses = result.response?.data?.statuses ?? [];
  const st: HlStatus = statuses[0] ?? {};

  if (st.error) throw new Error(`Hyperliquid: ${st.error}`);

  const oid = st.filled?.oid ?? st.resting?.oid ?? 0;
  const fillPrice = st.filled?.avgPx ? parseFloat(st.filled.avgPx) : undefined;

  return jsonOk({
    orderId: String(oid),
    status: st.filled ? 'filled' : 'accepted',
    fillPrice,
    message: `Order placed via Hyperliquid`,
  });
}

// ─── Hotstuff ─────────────────────────────────────────────────────────────────

async function placeHotstuffOrder(params: {
  symbol: string;
  side: 'buy' | 'sell';
  sizeUsd: number;
  apiPrivateKey: `0x${string}`;
}): Promise<Response> {
  const [
    { HttpTransport, InfoClient, ExchangeClient },
    { createWalletClient, http },
    { mainnet },
    { privateKeyToAccount },
  ] = await Promise.all([
    import('@hotstuff-labs/ts-sdk'),
    import('viem'),
    import('viem/chains'),
    import('viem/accounts'),
  ]);

  const base = baseFromSymbol(params.symbol);
  const perpSymbol = `${base}-PERP`;

  const transport = new HttpTransport({ isTestnet: false });
  const info = new InfoClient({ transport });

  // Resolve instrument ID + metadata
  const instruments = await info.instruments({ type: 'perps' });
  const instrument = instruments.perps.find(
    i => i.name === perpSymbol || i.name.toUpperCase() === `${base.toUpperCase()}-PERP`,
  );
  if (!instrument) throw new Error(`${perpSymbol} not found on Hotstuff`);

  // Best bid/ask for limit price
  const bboList = await info.bbo({ symbol: perpSymbol });
  const bbo = bboList[0];
  if (!bbo) throw new Error(`No order-book data for ${perpSymbol} on Hotstuff`);

  const refPrice = params.side === 'buy'
    ? parseFloat(bbo.best_ask_price)
    : parseFloat(bbo.best_bid_price);
  if (!refPrice) throw new Error(`Invalid price for ${perpSymbol}`);

  // Lot / tick sizes (defaults for safety)
  const lotSize = instrument.lot_size > 0 ? instrument.lot_size : 0.001;
  const tickSize = instrument.tick_size > 0 ? instrument.tick_size : 0.01;

  // Size in base, rounded down to nearest lot
  const rawSize = params.sizeUsd / refPrice;
  const size = Math.floor(rawSize / lotSize) * lotSize;
  if (size <= 0) throw new Error(`Order size too small: $${params.sizeUsd} USD`);

  // IOC limit slightly aggressive so it fills against resting liquidity
  const aggressivePx = params.side === 'buy' ? refPrice * 1.002 : refPrice * 0.998;
  const roundedPx = Math.round(aggressivePx / tickSize) * tickSize;

  const priceDp = Math.max(0, Math.ceil(-Math.log10(tickSize)));
  const sizeDp = Math.max(0, Math.ceil(-Math.log10(lotSize)));

  const account = privateKeyToAccount(params.apiPrivateKey);
  const wallet = createWalletClient({ account, chain: mainnet, transport: http() });
  const exchange = new ExchangeClient({ transport, wallet });

  const raw = await exchange.placeOrder({
    orders: [
      {
        instrumentId: instrument.id,
        side: params.side === 'buy' ? 'b' : 's',
        positionSide: 'BOTH',
        price: roundedPx.toFixed(priceDp),
        size: size.toFixed(sizeDp),
        tif: 'IOC',
        ro: false,
        po: false,
        cloid: `order-${Date.now()}`,
        triggerPx: '',
        isMarket: false,
        tpsl: '',
        grouping: 'normal',
      },
    ],
    expiresAfter: Date.now() + 60_000,
  });

  const result = raw as { oid?: number | string; [k: string]: unknown };
  const orderId = String(result.oid ?? `hs-${Date.now()}`);

  return jsonOk({
    orderId,
    status: 'accepted',
    message: `Order placed via Hotstuff`,
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

async function handleOrdersPlace(req: NextRequest): Promise<Response> {
  const body = await readBody<{
    exchange?: unknown;
    symbol?: unknown;
    side?: unknown;
    sizeUsd?: unknown;
    apiPrivateKey?: unknown;
    walletAddress?: unknown;
  }>(req);

  if (body.exchange !== 'hyperliquid' && body.exchange !== 'hotstuff') {
    return jsonError('Invalid exchange. Supported: hyperliquid, hotstuff', 400);
  }
  if (typeof body.symbol !== 'string' || !body.symbol.includes('/')) {
    return jsonError('symbol must be in BASE/QUOTE format, e.g. BTC/USD', 400);
  }
  if (body.side !== 'buy' && body.side !== 'sell') {
    return jsonError('side must be buy or sell', 400);
  }
  const sizeUsd = Number(body.sizeUsd);
  if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
    return jsonError('sizeUsd must be a positive number', 400);
  }
  if (typeof body.apiPrivateKey !== 'string' || body.apiPrivateKey.trim().length < 10) {
    return jsonError('apiPrivateKey is required', 400);
  }
  const walletAddress = typeof body.walletAddress === 'string' && body.walletAddress.trim()
    ? body.walletAddress.trim()
    : undefined;
  if (walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return jsonError('walletAddress must be a valid 0x address', 400);
  }

  const privateKey = normalizeKey(body.apiPrivateKey);

  try {
    if (body.exchange === 'hyperliquid') {
      return await placeHyperliquidOrder({
        symbol: body.symbol,
        side: body.side,
        sizeUsd,
        apiPrivateKey: privateKey,
        walletAddress,
      });
    }

    return await placeHotstuffOrder({
      symbol: body.symbol,
      side: body.side,
      sizeUsd,
      apiPrivateKey: privateKey,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const p = await params;
  const route = p.path.join('/');

  if (route === 'orders/place') return handleOrdersPlace(req);
  return jsonError('Route not found', 404);
}

export async function GET(): Promise<Response> {
  return jsonError('Method not allowed', 405);
}

export async function PUT(): Promise<Response> {
  return jsonError('Method not allowed', 405);
}

export async function PATCH(): Promise<Response> {
  return jsonError('Method not allowed', 405);
}

export async function DELETE(): Promise<Response> {
  return jsonError('Method not allowed', 405);
}
