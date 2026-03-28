import type { PlaceOrderRequest, PlaceOrderResponse } from '@/types/trading';

const BASE = '/api/trading';

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      msg = data.error ?? data.message ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return (await res.json()) as TRes;
}

export function placeOrder(body: PlaceOrderRequest): Promise<PlaceOrderResponse> {
  return postJson<PlaceOrderRequest, PlaceOrderResponse>('/orders/place', body);
}
