import type { ApiEndpointWithBody } from '@repo/api-client';
import { cookies } from 'next/headers';

import { webOrigin } from '../bff/config';

/**
 * Helper type that represents either an endpoint with or without a body
 * Since ApiEndpointWithBody extends ApiEndpoint, we can use it for both cases
 */
type FetchEndpoint<TResponse> = ApiEndpointWithBody<unknown, TResponse>;

/**
 * Server-side fetch utility for Server Components and Route Handlers
 * Handles cookies, headers, and caching strategies for server context
 */
export async function serverFetch<TResponse>(
  endpoint: FetchEndpoint<TResponse>,
): Promise<TResponse> {
  const { url, method } = endpoint;
  const body = 'body' in endpoint ? endpoint.body : undefined;

  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${webOrigin()}/api/bff${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeader,
      ...(method === 'GET' ? {} : { origin: webOrigin() }),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store', // Server components default to no caching
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  // Handle empty responses (e.g., DELETE)
  const text = await response.text();
  return text ? (JSON.parse(text) as TResponse) : (undefined as TResponse);
}
