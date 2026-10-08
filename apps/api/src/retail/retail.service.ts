import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { refundCapabilities } from '../orders/refund.policy';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@repo/prisma';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedActor } from '../auth/auth.types';
import { can, type Permission } from '@repo/authorization';
import type { AdjustStockDto, CreateSaleDto } from './retail.dto';

@Injectable()
export class RetailService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(actor: AuthenticatedActor) {
    return {
      id: { in: actor.storeIds },
      tenantId: actor.tenantId,
      region: actor.region,
    };
  }

  private require(actor: AuthenticatedActor, permission: Permission) {
    if (!can(actor, permission))
      throw new ForbiddenException('Your role cannot perform this action');
  }

  async dashboard(actor: AuthenticatedActor) {
    this.require(actor, 'store.read');
    const stores = await this.prisma.client.store.findMany({
      where: this.scope(actor),
      orderBy: { id: 'asc' },
      include: {
        products: { include: { product: true }, orderBy: { productId: 'asc' } },
        orders: {
          include: { items: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        audits: { orderBy: { createdAt: 'desc' }, take: 15 },
      },
    });
    const capabilities = await refundCapabilities(
      this.prisma.client,
      actor,
      stores.flatMap((store) => store.orders.map((order) => order.id)),
    );
    return {
      actor,
      stores: stores.map((store) => ({
        ...store,
        products: store.products.map((p) => ({ ...p, price: Number(p.price) })),
        orders: store.orders.map((o) => ({
          ...o,
          total: Number(o.total),
          capabilities: { refund: capabilities.get(o.id)! },
          items: o.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice) })),
        })),
      })),
    };
  }

  async adjust(actor: AuthenticatedActor, id: string, input: AdjustStockDto) {
    this.require(actor, 'inventory.adjust');
    if (!input.reason.trim())
      throw new BadRequestException('A reason is required');
    return this.prisma.client.$transaction(async (tx) => {
      const item = await tx.storeProduct.findFirst({
        where: { id, store: this.scope(actor) },
      });
      if (!item)
        throw new ForbiddenException('Product is outside your branch scope');
      const changed = await tx.storeProduct.updateMany({
        where: {
          id,
          stock: { gte: Math.max(0, -input.delta) },
          store: this.scope(actor),
        },
        data: { stock: { increment: input.delta } },
      });
      if (changed.count !== 1)
        throw new BadRequestException('Not enough stock for this adjustment');
      await tx.inventoryMovement.create({
        data: {
          storeProductId: id,
          quantityDelta: input.delta,
          reason: input.reason.trim(),
        },
      });
      await tx.auditEvent.create({
        data: {
          storeId: item.storeId,
          actorId: actor.id,
          action: 'inventory.adjust',
          detail: `${input.delta > 0 ? '+' : ''}${input.delta} units · ${input.reason.trim()}`,
        },
      });
      return { ok: true };
    });
  }

  async sale(actor: AuthenticatedActor, input: CreateSaleDto) {
    this.require(actor, 'order.create');
    return this.prisma.client.$transaction(async (tx) => {
      const item = await tx.storeProduct.findFirst({
        where: {
          id: input.storeProductId,
          store: this.scope(actor),
          isAvailable: true,
          product: { active: true, tenantId: actor.tenantId },
        },
        include: { product: true },
      });
      if (!item)
        throw new ForbiddenException(
          'Product is unavailable or outside your branch scope',
        );
      const changed = await tx.storeProduct.updateMany({
        where: {
          id: item.id,
          stock: { gte: input.quantity },
          price: item.price,
          isAvailable: true,
          store: this.scope(actor),
        },
        data: { stock: { decrement: input.quantity } },
      });
      if (changed.count !== 1)
        throw new BadRequestException(
          'Stock or price changed. Refresh and try again.',
        );
      const id = randomUUID();
      const order = await tx.order.create({
        data: {
          id,
          tenantId: actor.tenantId,
          region: actor.region,
          storeId: item.storeId,
          customerId: 'walk-in',
          status: 'PAID',
          total: new Prisma.Decimal(item.price).mul(input.quantity),
          items: {
            create: {
              productId: item.productId,
              quantity: input.quantity,
              unitPrice: item.price,
              productNameSnapshot: item.product.name,
            },
          },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          storeProductId: item.id,
          quantityDelta: -input.quantity,
          reason: `Sale ${id}`,
        },
      });
      await tx.auditEvent.create({
        data: {
          storeId: item.storeId,
          actorId: actor.id,
          action: 'order.create',
          detail: `${input.quantity} × ${item.product.name} · THB ${order.total}`,
        },
      });
      return { id };
    });
  }
}
