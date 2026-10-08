import {
  can,
  internalExchangeKey,
  verifyAccessToken,
} from '@repo/authorization';
import {
  internalApiUrl,
  isTrustedOrigin,
  webOrigin,
} from '../../../../lib/bff/config';
import { protectedRoute } from '../../../../lib/bff/route-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  const route = protectedRoute(request.method, path);
  if (!route) return Response.json({ message: 'Not found' }, { status: 404 });
  if (
    request.method !== 'GET' &&
    !isTrustedOrigin(request.headers.get('origin'))
  )
    return Response.json(
      { message: 'Invalid request origin' },
      { status: 403 },
    );

  const secret = process.env.AUTH_COOKIE_SECRET;
  const api = internalApiUrl();
  let token: string | null = null;
  if (!route.public) {
    if (!secret) throw new Error('AUTH_COOKIE_SECRET is required');
    let exchange: Response;
    try {
      exchange = await fetch(new URL('/auth/access-token', api), {
        method: 'POST',
        headers: {
          cookie: request.headers.get('cookie') || '',
          'x-bff-key': await internalExchangeKey(secret),
        },
        cache: 'no-store',
      });
    } catch {
      return Response.json(
        { message: 'Authentication service unavailable' },
        { status: 502 },
      );
    }
    if (!exchange.ok)
      return Response.json(
        { message: 'Authentication required' },
        { status: 401 },
      );
    const data: unknown = await exchange.json().catch(() => null);
    if (!data || typeof data !== 'object' || !('accessToken' in data))
      return Response.json(
        { message: 'Invalid authentication response' },
        { status: 502 },
      );
    token = typeof data.accessToken === 'string' ? data.accessToken : null;
    if (!token)
      return Response.json(
        { message: 'Invalid authentication response' },
        { status: 502 },
      );
    const claims = await verifyAccessToken(token, secret);
    if (!claims)
      return Response.json(
        { message: 'Invalid access token' },
        { status: 401 },
      );
    if (route.permission && !can(claims, route.permission))
      return Response.json(
        {
          message:
            route.permission === 'order.refund'
              ? 'Your role does not have order.refund permission.'
              : 'Role lacks permission',
        },
        { status: 403 },
      );
  }

  const target = new URL(route.path, api);
  target.search = new URL(request.url).search;
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        origin: webOrigin(),
        'content-type': 'application/json',
      },
      body: request.method === 'GET' ? undefined : await request.text(),
      cache: 'no-store',
    });
  } catch {
    return Response.json({ message: 'API unavailable' }, { status: 502 });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type':
        upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;

export const DELETE = handle;
