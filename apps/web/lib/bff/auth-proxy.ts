import { internalApiUrl, isTrustedOrigin, webOrigin } from './config';

/** Only the existing login, callback, provider redirect and logout paths. */
export async function proxyAuth(
  request: Request,
  path: string,
): Promise<Response> {
  const method = request.method;
  const allowed =
    (method === 'GET' &&
      ['/auth/login', '/auth/callback', '/mock-provider/authorize'].includes(
        path,
      )) ||
    (method === 'POST' && ['/auth/logout', '/auth/logout-all'].includes(path));
  if (!allowed) return new Response('Not found', { status: 404 });
  if (method === 'POST' && !isTrustedOrigin(request.headers.get('origin')))
    return Response.json(
      { message: 'Invalid request origin' },
      { status: 403 },
    );

  const destination = new URL(
    path + new URL(request.url).search,
    internalApiUrl(),
  );
  let upstream: Response;
  try {
    upstream = await fetch(destination, {
      method,
      headers: {
        cookie: request.headers.get('cookie') || '',
        ...(method === 'POST' ? { origin: webOrigin() } : {}),
      },
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      { message: 'Authentication service unavailable' },
      { status: 502 },
    );
  }
  const headers = new Headers();
  for (const name of ['location', 'content-type']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie())
    headers.append('set-cookie', cookie);
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers });
}
