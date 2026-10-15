import {
  isPermission,
  type GrantCondition,
  type Permission,
  type PermissionGrant,
} from '@repo/authorization';
import { RoleCode } from '@repo/prisma';

const tenant: GrantCondition = {
  operator: 'equals',
  subjectField: 'tenantId',
  resourceField: 'tenantId',
};
const assignedStore: GrantCondition = {
  operator: 'includes',
  subjectField: 'storeIds',
  resourceField: 'storeId',
};

/** All grants are built by the API from reviewed scope rules and database roles. */
export function buildPermissionGrants(
  role: RoleCode,
  codes: string[],
): PermissionGrant[] {
  return codes.map((code) => {
    if (!isPermission(code)) throw new Error(`Unsupported permission: ${code}`);
    return { permission: code, conditions: conditionsFor(role, code) };
  });
}

function conditionsFor(
  role: RoleCode,
  permission: Permission,
): GrantCondition[] {
  if (role === RoleCode.CUSTOMER) {
    if (permission !== 'order.read')
      throw new Error(`Unsupported customer grant: ${permission}`);
    return [tenant];
  }
  switch (permission) {
    case 'store.read':
    case 'order.create':
    case 'order.read':
    case 'order.update_status':
    case 'order.refund':
    case 'inventory.adjust':
      return [tenant, assignedStore];
    case 'promotion.manage':
      return [tenant];
  }
}
