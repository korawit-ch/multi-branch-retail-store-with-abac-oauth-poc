import { can, hasPermission, resourceScope } from '@repo/authorization';
import { protectedRoute } from './route-policy';

describe('BFF route allowlist', () => {
  it('maps protected retail and order operations to permission snapshots', () => {
    expect(protectedRoute('GET', ['retail'])).toEqual({
      path: '/retail',
      permission: 'store.read',
    });
    expect(protectedRoute('POST', ['retail', 'sales'])?.permission).toBe(
      'order.create',
    );
    expect(
      protectedRoute('POST', ['retail', 'inventory', '10-coffee', 'adjust'])
        ?.permission,
    ).toBe('inventory.adjust');
    expect(protectedRoute('GET', ['orders', '901'])?.permission).toBe(
      'order.read',
    );
    expect(protectedRoute('PATCH', ['orders', '901'])?.permission).toBe(
      'order.update_status',
    );
    expect(
      protectedRoute('POST', ['orders', '901', 'refund'])?.permission,
    ).toBe('order.refund');
  });

  it('does not turn resource IDs into trusted store scope or proxy arbitrary paths', () => {
    expect(protectedRoute('GET', ['retail', '42'])).toBeNull();
    expect(protectedRoute('POST', ['orders', '901'])).toBeNull();
    expect(protectedRoute('GET', ['auth', 'access-token'])).toBeNull();
    expect(protectedRoute('GET', ['orders', 'access-summary'])).toEqual({
      path: '/orders/access-summary',
    });
  });

  it('shares permission, tenant, and assigned-store decisions with Nest', () => {
    const auth = {
      subject: {
        userId: 'manager',
        tenantId: 'thai-food',
        storeIds: ['10'],
      },
      grants: [
        {
          permission: 'order.refund' as const,
          conditions: [
            {
              operator: 'equals' as const,
              subjectField: 'tenantId' as const,
              resourceField: 'tenantId' as const,
            },
            {
              operator: 'includes' as const,
              subjectField: 'storeIds' as const,
              resourceField: 'storeId' as const,
            },
          ],
        },
      ],
    };
    expect(hasPermission(auth, 'order.refund')).toBe(true);
    expect(
      can(auth, 'order.refund', {
        tenantId: 'thai-food',
        storeId: '10',
      }),
    ).toBe(true);
    expect(
      can(auth, 'order.refund', {
        storeId: '42',
      }),
    ).toBe(false);
    expect(
      can(auth, 'order.refund', {
        tenantId: 'other-company',
      }),
    ).toBe(false);
    expect(hasPermission(auth, 'order.create')).toBe(false);
    expect(resourceScope(auth, 'order.refund')).toEqual({
      tenantId: 'thai-food',
      storeId: { in: ['10'] },
    });
  });
});
