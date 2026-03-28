import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

async function proxy(req: NextRequest, pathSegments: string[]): Promise<Response> {
  const rawHost = req.headers.get('x-dxd-host');
  if (!rawHost) {
    return Response.json({ detail: 'Missing x-dxd-host header' }, { status: 400 });
  }

  let hostUrl: URL;
  try {
    hostUrl = new URL(rawHost);
  } catch {
    return Response.json({ detail: 'Invalid x-dxd-host value — must be a full URL' }, { status: 400 });
  }
  if (hostUrl.protocol !== 'http:' && hostUrl.protocol !== 'https:') {
    return Response.json({ detail: 'x-dxd-host must use http or https' }, { status: 400 });
  }

  const path = pathSegments.join('/');
  const qs = req.nextUrl.searchParams.toString();
  const upstream = `${rawHost.replace(/\/$/, '')}/v1/${path}${qs ? `?${qs}` : ''}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key === 'x-dxd-host' || key === 'host' || key === 'content-length') return;
    headers.set(key, value);
  });
  // Ensure JSON content-type for mutation methods
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    headers.set('content-type', 'application/json');
  }

  const body =
    req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;

  const upstreamRes = await fetch(upstream, {
    method: req.method,
    headers,
    body: body || undefined,
  });

  const resBody = await upstreamRes.text();
  const contentType = upstreamRes.headers.get('content-type') ?? 'application/json';
  return new Response(resBody, {
    status: upstreamRes.status,
    headers: { 'content-type': contentType },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx): Promise<Response> {
  const p = await ctx.params;
  try {
    return await proxy(req, p.path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ detail: `Proxy error: ${msg}` }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
