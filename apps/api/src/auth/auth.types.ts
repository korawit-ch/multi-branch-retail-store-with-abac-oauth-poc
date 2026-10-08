import type { RoleCode } from '@repo/prisma';
import type { AuthorizationContext } from '@repo/authorization';

export type AuthenticatedActor = AuthorizationContext & {
  id: string;
  name: string;
  tenantId: string;
  region: string;
  refundLimit: number;
  customerId: string | null;
  role: RoleCode;
};
