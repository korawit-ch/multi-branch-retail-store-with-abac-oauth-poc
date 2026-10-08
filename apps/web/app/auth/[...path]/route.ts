import { proxyAuth } from '../../../lib/bff/auth-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  const { path } = await context.params;
  return proxyAuth(request, `/auth/${path.join('/')}`);
}

export async function POST(request: Request, context: Context) {
  const { path } = await context.params;
  return proxyAuth(request, `/auth/${path.join('/')}`);
}
