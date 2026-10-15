import { refundCapabilities, refundPolicy } from './refund.policy';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, RoleCode, type Prisma } from '@repo/prisma';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedActor } from '../auth/auth.types';
import {
  hasPermission,
  resourceScope,
  type Permission,
} from '@repo/authorization';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(actor: AuthenticatedActor, id: string) {
    this.requirePermission(actor, 'order.read');
    const order = await this.prisma.client.order.findFirst({
      where: this.scope(actor, 'order.read', id),
    });
    if (!order)
      throw new ForbiddenException('Order is outside the authorized scope');
    const capabilities = await refundCapabilities(this.prisma.client, actor, [
      order.id,
    ]);
    return {
      ...this.serialize(order),
      capabilities: { refund: capabilities.get(order.id)! },
    };
  }

  async updateStatus(actor: AuthenticatedActor, id: string, next: OrderStatus) {
    this.requirePermission(actor, 'order.update_status');
    const current = await this.prisma.client.order.findFirst({
      where: this.scope(actor, 'order.update_status', id),
    });
    if (!current)
      throw new ForbiddenException(
        'Order is outside the authorized store scope',
      );
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      PAID: [OrderStatus.PREPARING],
      PREPARING: [OrderStatus.READY],
      READY: [],
      REFUNDED: [],
    };
    if (!transitions[current.status].includes(next))
      throw new ForbiddenException('Invalid order status transition');

    const result = await this.prisma.client.order.updateMany({
      where: {
        ...this.scope(actor, 'order.update_status', id),
        status: current.status,
      },
      data: { status: next },
    });
    if (result.count !== 1)
      throw new ForbiddenException('Order changed before the update completed');
    return { orderId: id, from: current.status, to: next };
  }

  async refund(actor: AuthenticatedActor, id: string) {
    const policy = refundPolicy(actor);
    if (!policy.permitted) throw new ForbiddenException(policy.reason);
    const result = await this.prisma.client.order.updateMany({
      where: { ...policy.where, id },
      data: { status: OrderStatus.REFUNDED },
    });
    if (result.count !== 1) throw new ForbiddenException(policy.reason);
    return { orderId: id, status: OrderStatus.REFUNDED };
  }

  async accessSummary(actor: AuthenticatedActor) {
    const checks = [
      ['Read order 900 (Store 42)', 'order.read', '900'],
      ['Read order 903 (another tenant)', 'order.read', '903'],
      ['Refund paid order 901 (300)', 'order.refund', '901'],
      ['Refund paid order 902 (800)', 'order.refund', '902'],
    ] as const;
    const examples = await Promise.all(
      checks.map(async ([label, permission, id]) => {
        if (!hasPermission(actor, permission))
          return { label, allowed: false, reason: 'Role lacks permission' };
        const where =
          permission === 'order.refund'
            ? {
                ...refundPolicy(actor).where,
                id,
              }
            : this.scope(actor, permission, id);
        const allowed = (await this.prisma.client.order.count({ where })) === 1;
        return {
          label,
          allowed,
          reason: allowed
            ? 'Allowed by role and SQL resource scope'
            : 'Resource conditions denied access',
        };
      }),
    );
    return {
      actor: {
        name: actor.name,
        role: actor.role,
      },
      examples,
    };
  }

  private requirePermission(actor: AuthenticatedActor, permission: Permission) {
    if (!hasPermission(actor, permission))
      throw new ForbiddenException('Role lacks permission');
  }

  private scope(
    actor: AuthenticatedActor,
    permission: Permission,
    id: string,
  ): Prisma.OrderWhereInput {
    const grantScope = resourceScope(actor, permission);
    if (!grantScope?.tenantId)
      throw new ForbiddenException('Permission has no tenant scope');
    const base = { id, ...grantScope, region: actor.region };
    if (actor.role === RoleCode.CUSTOMER)
      return { ...base, customerId: actor.customerId ?? '__none__' };
    if (!grantScope.storeId)
      throw new ForbiddenException('Permission has no store scope');
    return base;
  }

  private serialize<T extends { total: unknown }>(order: T) {
    return { ...order, total: Number(order.total) };
  }
}
