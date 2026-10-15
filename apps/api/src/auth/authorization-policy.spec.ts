import {
  can,
  hasPermission,
  resourceScope,
  toAuthorizationContext,
} from '@repo/authorization';
import { buildPermissionGrants } from './authorization-policy';

describe('conditional permission matrix', () => {
  const claims = {
    sub: 'manager',
    attributes: { tenantId: 'thai-food', storeIds: ['10'] },
    grants: buildPermissionGrants('STORE_MANAGER', [
      'order.refund',
      'store.read',
    ]),
  };

  it('separates the named grant from resource eligibility and SQL scope', () => {
    const auth = toAuthorizationContext(claims)!;
    expect(hasPermission(auth, 'order.refund')).toBe(true);
    expect(can(auth, 'order.refund', { tenantId: 'thai-food' })).toBe(false);
    expect(
      can(auth, 'order.refund', { tenantId: 'thai-food', storeId: '10' }),
    ).toBe(true);
    expect(
      can(auth, 'order.refund', { tenantId: 'thai-food', storeId: '42' }),
    ).toBe(false);
    expect(resourceScope(auth, 'order.refund')).toEqual({
      tenantId: 'thai-food',
      storeId: { in: ['10'] },
    });
  });

  it('rejects unknown operators, fields, empty conditions, and duplicate grants', () => {
    expect(
      toAuthorizationContext({
        ...claims,
        grants: [
          {
            permission: 'order.refund',
            conditions: [
              {
                operator: 'execute',
                subjectField: 'tenantId',
                resourceField: 'tenantId',
              },
            ],
          },
        ],
      }),
    ).toBeNull();
    expect(
      toAuthorizationContext({
        ...claims,
        grants: [
          {
            permission: 'order.refund',
            conditions: [
              {
                operator: 'equals',
                subjectField: 'tenantId',
                resourceField: 'secretField',
              },
            ],
          },
        ],
      }),
    ).toBeNull();
    expect(
      toAuthorizationContext({
        ...claims,
        grants: [{ permission: 'order.refund', conditions: [] }],
      }),
    ).toBeNull();
    expect(
      toAuthorizationContext({
        ...claims,
        grants: [claims.grants[0], claims.grants[0]],
      }),
    ).toBeNull();
  });

  it('requires an explicit backend policy for every database grant', () => {
    expect(() => buildPermissionGrants('CUSTOMER', ['order.refund'])).toThrow();
    expect(() => buildPermissionGrants('STORE_MANAGER', ['unknown'])).toThrow();
    expect(
      buildPermissionGrants('CUSTOMER', ['order.read'])[0].conditions,
    ).toEqual([
      {
        operator: 'equals',
        subjectField: 'tenantId',
        resourceField: 'tenantId',
      },
    ]);
  });
});
