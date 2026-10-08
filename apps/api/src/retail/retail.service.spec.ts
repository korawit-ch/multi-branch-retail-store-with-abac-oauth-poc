import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@repo/prisma';
import type { AuthenticatedActor } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { RetailService } from './retail.service';

const actor: AuthenticatedActor = {
  id: 'manager',
  userId: 'manager',
  name: 'Manager',
  role: 'STORE_MANAGER',
  tenantId: 'thai-food',
  region: 'TH',
  refundLimit: 500,
  customerId: null,
  storeIds: ['10'],
  permissions: ['store.read', 'inventory.adjust', 'order.create'],
};
function setup() {
  const tx = {
    store: { findMany: jest.fn().mockResolvedValue([]) },
    storeProduct: { findFirst: jest.fn(), updateMany: jest.fn() },
    order: {
      create: jest.fn().mockResolvedValue({ total: new Prisma.Decimal(170) }),
    },
    inventoryMovement: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const client = {
    ...tx,
    $transaction: jest.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)),
  };
  return {
    tx,
    client,
    service: new RetailService({ client } as unknown as PrismaService),
  };
}
describe('Retail authorization and stock invariants', () => {
  it('denies staff stock writes before opening a transaction', async () => {
    const { service, client } = setup();
    await expect(
      service.adjust({ ...actor, permissions: ['store.read'] }, '10-coffee', {
        delta: 10,
        reason: 'Delivery',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.$transaction).not.toHaveBeenCalled();
  });
  it('scopes dashboard data to tenant, region and assigned branches', async () => {
    const { service, tx } = setup();
    await service.dashboard(actor);
    expect(tx.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['10'] }, tenantId: 'thai-food', region: 'TH' },
      }),
    );
  });
  it('denies a product outside assigned branches', async () => {
    const { service, tx } = setup();
    tx.storeProduct.findFirst.mockResolvedValue(null);
    await expect(
      service.sale(actor, { storeProductId: '42-coffee', quantity: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.order.create).not.toHaveBeenCalled();
  });
  it('rejects a concurrent stock depletion without creating sale or ledger rows', async () => {
    const { service, tx } = setup();
    tx.storeProduct.findFirst.mockResolvedValue({
      id: '10-coffee',
      storeId: '10',
      productId: 'coffee',
      price: new Prisma.Decimal(85),
      product: { name: 'Coffee' },
    });
    tx.storeProduct.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.sale(actor, { storeProductId: '10-coffee', quantity: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });
  it('calculates totals from server price and snapshots the purchased item', async () => {
    const { service, tx } = setup();
    tx.storeProduct.findFirst.mockResolvedValue({
      id: '10-coffee',
      storeId: '10',
      productId: 'coffee',
      price: new Prisma.Decimal(85),
      product: { name: 'Coffee' },
    });
    tx.storeProduct.updateMany.mockResolvedValue({ count: 1 });
    await service.sale(actor, { storeProductId: '10-coffee', quantity: 2 });
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.total.toString()).toBe('170');
    expect(data.items.create).toEqual({
      productId: 'coffee',
      quantity: 2,
      unitPrice: new Prisma.Decimal(85),
      productNameSnapshot: 'Coffee',
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ quantityDelta: -2 }),
    });
    expect(tx.auditEvent.create).toHaveBeenCalled();
  });
});
