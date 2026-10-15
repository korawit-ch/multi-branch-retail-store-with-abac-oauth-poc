import { OrderStatus, type Prisma, type PrismaClient } from '@repo/prisma';
import type { AuthenticatedActor } from '../auth/auth.types';
import { hasPermission, resourceScope } from '@repo/authorization';

// One SQL policy supplies both read-time capabilities and atomic write conditions.
export function refundPolicy(actor: AuthenticatedActor) {
  const grantScope = resourceScope(actor, 'order.refund');
  const permitted =
    hasPermission(actor, 'order.refund') &&
    Boolean(grantScope?.tenantId && grantScope.storeId);
  const reason = permitted
    ? 'Refund requires a paid order in your assigned branch within your refund limit.'
    : 'Your role does not have order.refund permission.';
  const where: Prisma.OrderWhereInput = {
    ...grantScope,
    region: actor.region,
    status: OrderStatus.PAID,
    total: { lte: actor.refundLimit },
  };
  return { permitted, reason, where };
}

export async function refundCapabilities(
  client: PrismaClient,
  actor: AuthenticatedActor,
  ids: string[],
) {
  const policy = refundPolicy(actor);
  const eligible =
    policy.permitted && ids.length
      ? await client.order.findMany({
          where: { ...policy.where, id: { in: ids } },
          select: { id: true },
        })
      : [];
  const allowedIds = new Set(eligible.map((order) => order.id));
  return new Map(
    ids.map((id) => [
      id,
      allowedIds.has(id)
        ? { allowed: true, reason: null }
        : { allowed: false, reason: policy.reason },
    ]),
  );
}
