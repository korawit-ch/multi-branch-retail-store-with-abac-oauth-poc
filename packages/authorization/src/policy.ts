/** Small, runtime-independent authorization policy shared by the BFF and API. */
export const permissions = [
  'store.read',
  'order.create',
  'order.read',
  'order.update_status',
  'order.refund',
  'inventory.adjust',
  'promotion.manage',
] as const;

export type Permission = (typeof permissions)[number];

export type AuthorizationContext = {
  userId: string;
  tenantId: string;
  permissions: Permission[];
  storeIds: string[];
};

export type AuthorizationOptions = {
  tenantId?: string;
  storeId?: string;
};

export function isPermission(value: string): value is Permission {
  return (permissions as readonly string[]).includes(value);
}

export function can(
  auth: AuthorizationContext,
  permission: Permission,
  options: AuthorizationOptions = {},
): boolean {
  return (
    auth.permissions.includes(permission) &&
    (options.tenantId === undefined || options.tenantId === auth.tenantId) &&
    (options.storeId === undefined || auth.storeIds.includes(options.storeId))
  );
}
