import {
  hasPermission,
  toAuthorizationContext,
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

function accessCookie(header: string | null) {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('access_token='))
    ?.slice('access_token='.length);
}

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

  const secret = process.env.AUTH_JWT_SECRET;
  const api = internalApiUrl();
  let token: string | null = null;
  if (!route.public) {
    if (!secret) throw new Error('AUTH_JWT_SECRET is required');
    token = accessCookie(request.headers.get('cookie')) || null;
    if (!token)
      return Response.json(
        { message: 'Access token required' },
        { status: 401 },
      );
    const claims = await verifyAccessToken(token, secret);
    if (!claims)
      return Response.json(
        { message: 'Invalid access token' },
        { status: 401 },
      );
    const auth = toAuthorizationContext(claims);
    if (!auth)
      return Response.json(
        { message: 'Invalid authorization claims' },
        { status: 401 },
      );
    if (route.permission && !hasPermission(auth, route.permission))
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
