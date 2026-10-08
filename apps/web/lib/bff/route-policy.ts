import type { Permission } from '@repo/authorization';

type ProtectedRoute = {
  path: string;
  permission?: Permission;
  public?: boolean;
};

/** Explicit allowlist: dynamic IDs are never interpreted as tenant/store IDs. */
export function protectedRoute(
  method: string,
  segments: string[],
): ProtectedRoute | null {
  if (segments[0] === 'links') {
    if (segments.length === 1 && ['GET', 'POST'].includes(method))
      return { path: '/links', public: true };
    if (
      segments.length === 2 &&
      segments[1] &&
      ['GET', 'PATCH', 'DELETE'].includes(method)
    )
      return {
        path: `/links/${encodeURIComponent(segments[1])}`,
        public: true,
      };
  }
  if (method === 'GET' && segments.length === 1 && segments[0] === 'retail')
    return { path: '/retail', permission: 'store.read' };
  if (
    method === 'POST' &&
    segments.length === 2 &&
    segments[0] === 'retail' &&
    segments[1] === 'sales'
  )
    return { path: '/retail/sales', permission: 'order.create' };
  if (
    method === 'POST' &&
    segments.length === 4 &&
    segments[0] === 'retail' &&
    segments[1] === 'inventory' &&
    segments[3] === 'adjust' &&
    segments[2]
  )
    return {
      path: `/retail/inventory/${encodeURIComponent(segments[2])}/adjust`,
      permission: 'inventory.adjust',
    };
  if (segments[0] === 'orders' && segments.length === 2) {
    if (method === 'GET' && segments[1] === 'access-summary')
      return { path: '/orders/access-summary' };
    if (segments[1] && segments[1] !== 'access-summary') {
      const path = `/orders/${encodeURIComponent(segments[1])}`;
      if (method === 'GET') return { path, permission: 'order.read' };
      if (method === 'PATCH')
        return { path, permission: 'order.update_status' };
    }
  }
  if (
    method === 'POST' &&
    segments.length === 3 &&
    segments[0] === 'orders' &&
    segments[1] &&
    segments[2] === 'refund'
  )
    return {
      path: `/orders/${encodeURIComponent(segments[1])}/refund`,
      permission: 'order.refund',
    };
  return null;
}
