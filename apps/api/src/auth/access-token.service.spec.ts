import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  accessTokenLifetimeSeconds,
  verifyAccessToken,
} from '@repo/authorization';
import type { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { buildPermissionGrants } from './authorization-policy';
import type { AuthenticatedActor } from './auth.types';

const secret = Buffer.alloc(32, 3).toString('base64url');
const actor: AuthenticatedActor = {
  id: 'manager',
  name: 'Manager',
  region: 'TH',
  role: 'STORE_MANAGER',
  customerId: null,
  refundLimit: 500,
  subject: { userId: 'manager', tenantId: 'thai-food', storeIds: ['10'] },
  grants: buildPermissionGrants('STORE_MANAGER', [
    'store.read',
    'order.refund',
  ]),
};

function setup() {
  const user = {
    findUnique: jest.fn().mockResolvedValue({
      name: actor.name,
      tenantId: actor.subject.tenantId,
      region: 'TH',
      refundLimit: 250,
      customerId: null,
    }),
  };
  const authSession = { findUnique: jest.fn() };
  const service = new AccessTokenService({
    client: { user, authSession },
  } as unknown as PrismaService);
  return { service, user, authSession };
}

describe('AccessTokenService', () => {
  const previousSecret = process.env.AUTH_JWT_SECRET;
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = secret;
  });
  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = previousSecret;
  });

  it('issues a ten-minute signed grant matrix and loads current domain attributes', async () => {
    const { service, authSession } = setup();
    const token = await service.issue(actor);
    const claims = await verifyAccessToken(token, secret);
    expect(claims).toMatchObject({
      sub: 'manager',
      attributes: { tenantId: 'thai-food', storeIds: ['10'] },
      grants: actor.grants,
    });
    expect(claims!.exp - claims!.iat).toBe(accessTokenLifetimeSeconds);
    await expect(
      service.authenticate(`Bearer ${token}`, 'order.refund'),
    ).resolves.toMatchObject({ refundLimit: 250, subject: actor.subject });
    expect(authSession.findUnique).not.toHaveBeenCalled();
  });

  it('denies a missing grant and a changed tenant', async () => {
    const { service, user } = setup();
    const token = await service.issue(actor);
    await expect(
      service.authenticate(`Bearer ${token}`, 'inventory.adjust'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    user.findUnique.mockResolvedValue({ tenantId: 'another-tenant' });
    await expect(
      service.authenticate(`Bearer ${token}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects forged or expired tokens before database access', async () => {
    const { service, user } = setup();
    await expect(service.authenticate('Bearer forged')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(user.findUnique).not.toHaveBeenCalled();
    const realNow = Date.now;
    const start = realNow();
    Date.now = () => start;
    try {
      const token = await service.issue(actor);
      Date.now = () => start + (accessTokenLifetimeSeconds + 1) * 1000;
      await expect(
        service.authenticate(`Bearer ${token}`),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(user.findUnique).not.toHaveBeenCalled();
    } finally {
      Date.now = realNow;
    }
  });
});
