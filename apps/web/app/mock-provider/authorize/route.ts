import { proxyAuth } from '../../../lib/bff/auth-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return proxyAuth(request, '/mock-provider/authorize');
}
