import { MARKET_PAIRS } from '@/lib/pairs';
import { buildFundingMatrix } from '@/lib/funding/buildMatrix';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('symbols');
  const pairIds = raw
    ? raw.split(',').map(s => s.trim()).filter(Boolean)
    : MARKET_PAIRS.map(p => p.id);

  if (pairIds.length === 0) {
    return Response.json({ error: 'No symbols' }, { status: 400 });
  }

  try {
    const body = await buildFundingMatrix(pairIds);
    return Response.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
