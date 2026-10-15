export {
  permissions,
  isPermission,
  toAuthorizationContext,
  hasPermission,
  can,
  resourceScope,
} from './policy.js';
export type {
  Permission,
  AuthorizationContext,
  SubjectAttributes,
  ResourceAttributes,
  ResourceField,
  ResourceScope,
  GrantCondition,
  PermissionGrant,
} from './policy.js';

export {
  accessTokenLifetimeSeconds,
  signAccessToken,
  verifyAccessToken,
} from './access-token.js';
export type { AccessClaims } from './access-token.js';
