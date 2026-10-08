export { permissions, isPermission, can } from './policy.js';
export type {
  Permission,
  AuthorizationContext,
  AuthorizationOptions,
} from './policy.js';

export {
  accessTokenLifetimeSeconds,
  internalExchangeKey,
  signAccessToken,
  verifyAccessToken,
} from './access-token.js';
export type { AccessClaims } from './access-token.js';
