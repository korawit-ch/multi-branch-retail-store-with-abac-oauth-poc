import type { ApiEndpointWithBody } from '@repo/api-client';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly responseBody: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_URL = '/api/bff';

/**
 * Helper type that represents either an endpoint with or without a body
 * Since ApiEndpointWithBody extends ApiEndpoint, we can use it for both cases
 */
type FetchEndpoint<TResponse> = ApiEndpointWithBody<unknown, TResponse>;

/**
 * Client-side fetch utility for use with TanStack Query
 * No caching here - TanStack Query handles that
 */
export async function clientFetch<TResponse>(
  endpoint: FetchEndpoint<TResponse>,
): Promise<TResponse> {
  const { url, method } = endpoint;
  const body = 'body' in endpoint ? endpoint.body : undefined;

  const response = await fetch(`${API_BASE_URL}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    let message = `Request failed (${response.status})`;
    if (error?.message)
      message = Array.isArray(error.message)
        ? error.message.join(', ')
        : error.message;
    throw new ApiError(response.status, message, error);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as TResponse) : (undefined as TResponse);
}
