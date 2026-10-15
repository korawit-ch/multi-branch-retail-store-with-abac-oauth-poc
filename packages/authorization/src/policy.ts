/** Pure authorization contract shared by the two trusted server runtimes. */
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
export type SubjectAttributes = {
  userId: string;
  tenantId: string;
  storeIds: string[];
};
export type ResourceAttributes = { tenantId: string; storeId: string };
export type ResourceField = keyof ResourceAttributes;
export type GrantCondition =
  | {
      operator: 'equals';
      subjectField: 'userId' | 'tenantId';
      resourceField: ResourceField;
    }
  | {
      operator: 'includes';
      subjectField: 'storeIds';
      resourceField: ResourceField;
    };
export type PermissionGrant = {
  permission: Permission;
  conditions: GrantCondition[];
};
export type AuthorizationContext = {
  subject: SubjectAttributes;
  grants: PermissionGrant[];
};
export type ResourceScope = Partial<
  Record<ResourceField, string | { in: string[] }>
>;

const scalarSubjectFields = ['userId', 'tenantId'] as const;
const arraySubjectFields = ['storeIds'] as const;
const resourceFields = ['tenantId', 'storeId'] as const;

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && permissions.includes(value as Permission);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keysAre(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isCondition(value: unknown): value is GrantCondition {
  if (
    !record(value) ||
    !keysAre(value, ['operator', 'subjectField', 'resourceField']) ||
    !resourceFields.includes(value.resourceField as ResourceField)
  )
    return false;
  if (value.operator === 'equals')
    return scalarSubjectFields.includes(
      value.subjectField as (typeof scalarSubjectFields)[number],
    );
  if (value.operator === 'includes')
    return arraySubjectFields.includes(
      value.subjectField as (typeof arraySubjectFields)[number],
    );
  return false;
}

function isGrant(value: unknown): value is PermissionGrant {
  if (
    !record(value) ||
    !keysAre(value, ['permission', 'conditions']) ||
    !isPermission(value.permission) ||
    !Array.isArray(value.conditions) ||
    value.conditions.length === 0 ||
    !value.conditions.every(isCondition)
  )
    return false;
  const fields = value.conditions.map((condition) => condition.resourceField);
  return new Set(fields).size === fields.length;
}

/** Validates all policy-bearing JWT claims after signature verification. */
export function toAuthorizationContext(
  claims: Record<string, unknown>,
): AuthorizationContext | null {
  const attributes = claims.attributes;
  const grants = claims.grants;
  if (
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    !record(attributes) ||
    !keysAre(attributes, ['tenantId', 'storeIds']) ||
    typeof attributes.tenantId !== 'string' ||
    !attributes.tenantId ||
    !Array.isArray(attributes.storeIds) ||
    !attributes.storeIds.every(
      (id: unknown) => typeof id === 'string' && id.length > 0,
    ) ||
    !Array.isArray(grants) ||
    !grants.every(isGrant) ||
    new Set(grants.map((grant) => grant.permission)).size !== grants.length
  )
    return null;
  return {
    subject: {
      userId: claims.sub,
      tenantId: attributes.tenantId,
      storeIds: attributes.storeIds,
    },
    grants,
  };
}

export function hasPermission(
  auth: AuthorizationContext,
  permission: Permission,
): boolean {
  return auth.grants.some((grant) => grant.permission === permission);
}

/** Missing required resource attributes always deny. */
export function can(
  auth: AuthorizationContext,
  permission: Permission,
  resource: Partial<ResourceAttributes>,
): boolean {
  const grant = auth.grants.find((item) => item.permission === permission);
  if (!grant || grant.conditions.length === 0) return false;
  return grant.conditions.every((condition) => {
    const value = resource[condition.resourceField];
    if (typeof value !== 'string') return false;
    const subject = auth.subject[condition.subjectField];
    return condition.operator === 'equals'
      ? subject === value
      : subject.includes(value);
  });
}

/** Returns plain filter values; callers must reject null before querying. */
export function resourceScope(
  auth: AuthorizationContext,
  permission: Permission,
): ResourceScope | null {
  const grant = auth.grants.find((item) => item.permission === permission);
  if (!grant || grant.conditions.length === 0) return null;
  return Object.fromEntries(
    grant.conditions.map((condition) => {
      const value = auth.subject[condition.subjectField];
      return [
        condition.resourceField,
        condition.operator === 'equals' ? value : { in: [...value] },
      ];
    }),
  ) as ResourceScope;
}
